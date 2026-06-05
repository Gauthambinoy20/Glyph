#!/bin/bash
# Cloud-init: install Docker Engine + the Compose plugin on first boot, so the box
# is ready to run the Glyph stack as soon as the code lands.
set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  >/etc/apt/sources.list.d/docker.list

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Let the default ubuntu user run docker without sudo.
usermod -aG docker ubuntu
systemctl enable --now docker

# Marker the deploy step polls on to know cloud-init has finished.
touch /var/lib/glyph-bootstrap-done
