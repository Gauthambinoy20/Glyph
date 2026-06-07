# Deployment & Production Hardening

> **The repo is already submission-complete** — 100% test coverage (backend + frontend),
> all CI/CD workflows green, IaC + containers + CI/CD in place. This document is the
> *optional* senior-grade hardening path ("path A": keep the single VM, operationalize it
> properly) plus the steps to turn on continuous deployment.
>
> **Everything here runs against the AWS account that owns the demo box (the `cobra` CLI
> profile).** It cannot be applied from a different account. Review each snippet before
> applying — these are a handoff runbook, not auto-applied changes.

## Layers

Glyph deploys in two independent layers:

| Layer | Tool | Updates |
|---|---|---|
| **Infrastructure** (EC2 box, security group, EIP, SSH key) | Terraform (`infra/`) | `terraform apply` |
| **Application** (the running containers) | Docker Compose + CI/CD | `deploy.yml`, or SSH + `docker compose pull` |

Prerequisites for everything below: `aws configure --profile cobra`, and a local copy of
`infra/terraform.tfstate` (until step 2 moves it remote).

---

## Step 1 — Turn on continuous deployment (fastest win)

`deploy.yml` already does build → push to GHCR → SSH deploy on every push to `main`; it's
gated off until the deploy target exists. In **GitHub → repo Settings → Secrets and
variables → Actions**, add:

| Type | Name | Value |
|---|---|---|
| Variable | `DEPLOY_HOST` | the box's Elastic IP / DNS |
| Variable | `DEPLOY_USER` | `ubuntu` |
| Secret | `DEPLOY_SSH_KEY` | contents of `infra/glyph-deploy.pem` |

The next push to `main` auto-deploys. Verify in the Actions tab that the `deploy` job runs
(not skipped). **Do not set `DEPLOY_HOST` without the SSH key** — every deploy would fail red.

---

## Step 2 — Remote Terraform state (S3 + DynamoDB lock)

Local state is the weakest link (single machine, no locking, can't share with CI). Move it
to S3 with a DynamoDB lock.

**One-time bootstrap** (with the `cobra` profile):

```bash
aws s3api create-bucket --bucket glyph-tfstate-<unique> --region eu-west-1 \
  --create-bucket-configuration LocationConstraint=eu-west-1 --profile cobra
aws s3api put-bucket-versioning --bucket glyph-tfstate-<unique> \
  --versioning-configuration Status=Enabled --profile cobra
aws dynamodb create-table --table-name glyph-tf-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH --billing-mode PAY_PER_REQUEST \
  --region eu-west-1 --profile cobra
```

Add to `infra/versions.tf`:

```hcl
terraform {
  backend "s3" {
    bucket         = "glyph-tfstate-<unique>"
    key            = "glyph/terraform.tfstate"
    region         = "eu-west-1"
    dynamodb_table = "glyph-tf-lock"
    encrypt        = true
    profile        = "cobra"
  }
}
```

Migrate: `cd infra && terraform init -migrate-state`.

**Keep CI green:** the `infra.yml` workflow can't reach the backend, so its validate step must
init without it — change the init step to `terraform init -backend=false` (validate and
`fmt`/`tflint` don't need real state).

---

## Step 3 — TLS (HTTPS) via Caddy + Let's Encrypt

Requires a **domain** (an A record pointing at the EIP — Let's Encrypt won't issue for a bare
IP). Add a Caddy reverse proxy to the box's compose file (`infra/docker-compose.ec2.yml`):

```yaml
  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
    depends_on: [frontend]
volumes:
  caddy_data:
```

`Caddyfile` (auto-provisions + renews the cert):

```
glyph.yourdomain.com {
  reverse_proxy frontend:80
}
```

Open 443 in the security group (`infra/main.tf`, the `aws_security_group.glyph` ingress),
then `terraform apply`. Drop the frontend's public `80:80` mapping so Caddy is the only edge.

---

## Step 4 — Zero-downtime deploys

Give the services a healthcheck and let compose wait for healthy before cutting over. In the
compose file:

```yaml
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8000/api/health"]
      interval: 10s
      timeout: 3s
      retries: 5
```

In the `deploy.yml` SSH step, deploy with:

```bash
docker compose -f docker-compose.ec2.yml pull
docker compose -f docker-compose.ec2.yml up -d --wait   # blocks until healthy, else rolls back
```

`--wait` fails the deploy if the new container never becomes healthy, so a bad image never
takes the site down.

---

## Step 5 — Secrets in AWS SSM Parameter Store

Stop keeping `OPENROUTER_API_KEY` (and friends) in a `.env` on the box.

1. Store them: `aws ssm put-parameter --name /glyph/openrouter_api_key --type SecureString --value '...' --profile cobra`
2. Attach an IAM instance role to the EC2 (in `infra/main.tf`) granting `ssm:GetParameter` on `/glyph/*`.
3. In `user_data.sh` / the deploy step, fetch at start: `aws ssm get-parameter --name /glyph/openrouter_api_key --with-decryption --query Parameter.Value --output text`.

The key never lives on disk in plaintext.

---

## Step 6 — Lock SSH ingress

The demo's security group currently allows SSH from `0.0.0.0/0`. Restrict it to your IP.

In `infra/variables.tf` add:

```hcl
variable "admin_cidr" {
  description = "CIDR allowed to SSH (e.g. 1.2.3.4/32)."
  type        = string
}
```

In `infra/main.tf`, change the SSH (port 22) ingress `cidr_blocks` from `["0.0.0.0/0"]` to
`[var.admin_cidr]`, then `terraform apply -var "admin_cidr=$(curl -s ifconfig.me)/32"`.

> Trade-off, on purpose: the public port-80 demo rule stays open; only SSH
> is locked. Re-run apply if your IP changes.

---

## Where this sits on the maturity ladder

This is **path A** — single VM, operationalized to senior standard (remote state, TLS,
zero-downtime, managed secrets, locked SSH). It is the right-sized choice for a single-user
demo. If you later want to *showcase* orchestration, **path B** is ECS Fargate + ALB + ECR
(rolling deploys, autoscaling, ACM TLS) — more moving parts, only worth it as a deliberate
scale demonstration, not for this traffic.

## Checklist

- [ ] 1. CD secrets set (`DEPLOY_HOST` / `DEPLOY_USER` / `DEPLOY_SSH_KEY`)
- [ ] 2. State in S3 + DynamoDB; `infra.yml` init uses `-backend=false`
- [ ] 3. TLS via Caddy (domain + A record + 443 open)
- [ ] 4. Healthchecks + `up -d --wait` in the deploy step
- [ ] 5. Secrets in SSM; IAM role on the instance
- [ ] 6. SSH locked to `admin_cidr`
