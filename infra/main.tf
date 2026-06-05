# Glyph production host: a single EC2 box running the Docker stack, behind a stable
# Elastic IP, in the default VPC. Small and self-contained on purpose — this is a
# portfolio demo, not a multi-AZ fleet.

# Latest Canonical Ubuntu 24.04 (Noble) AMI for the region.
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd*/ubuntu-noble-24.04-amd64-server-*"]
  }
  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# A fresh SSH keypair generated locally; the private key is written next to the
# Terraform state (gitignored) and used for deploys.
resource "tls_private_key" "deploy" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "deploy" {
  key_name   = "${var.project}-deploy"
  public_key = tls_private_key.deploy.public_key_openssh
}

resource "local_sensitive_file" "private_key" {
  content         = tls_private_key.deploy.private_key_pem
  filename        = "${path.module}/${var.project}-deploy.pem"
  file_permission = "0600"
}

# Security group: HTTP open to the world, SSH locked to ssh_cidr.
resource "aws_security_group" "glyph" {
  name        = "${var.project}-sg"
  description = "Glyph: allow HTTP from anywhere, SSH from ssh_cidr"

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_cidr]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "${var.project}-sg" }
}

resource "aws_instance" "glyph" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.deploy.key_name
  vpc_security_group_ids = [aws_security_group.glyph.id]
  user_data              = file("${path.module}/user_data.sh")

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  tags = { Name = var.project }
}

# Stable public address so the URL never changes across restarts.
resource "aws_eip" "glyph" {
  instance = aws_instance.glyph.id
  domain   = "vpc"
  tags     = { Name = "${var.project}-eip" }
}
