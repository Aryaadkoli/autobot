#!/usr/bin/env bash
# Run ONCE on a brand new Ubuntu VM (e.g. a free-tier instance on
# Oracle Cloud or Google Cloud) to get it ready to run Autobot. Safe to
# re-run — every step checks whether it's already done before doing it
# again.
#
# Usage: ssh into the fresh VM, then:
#   curl -fsSL https://raw.githubusercontent.com/<you>/<repo>/main/deploy/bootstrap.sh | bash
# or, if you've already cloned the repo:
#   bash deploy/bootstrap.sh

set -euo pipefail

echo "==> Updating system packages"
sudo apt-get update -y
sudo apt-get upgrade -y

echo "==> Installing Docker (official convenience script)"
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  echo "    Docker installed. You'll need to log out and back in (or run"
  echo "    'newgrp docker') for the group change to apply to this shell."
else
  echo "    Docker already installed, skipping."
fi

echo "==> Confirming the Docker Compose plugin is available"
docker compose version

echo "==> Setting up a swap file (a typical free-tier shape has only"
echo "    1GB RAM — a swap file prevents the Postgres+Next.js+worker"
echo "    combo from getting OOM-killed under load)"
if [ ! -f /swapfile ]; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  echo "    2GB swap file created and enabled."
else
  echo "    Swap file already exists, skipping."
fi

echo "==> Configuring the firewall (ufw)"
sudo apt-get install -y ufw
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status

echo ""
echo "==> Done. Next steps:"
echo "    1. Log out and back in (for the docker group to apply), or run: newgrp docker"
echo "    2. Also open ports 80 and 443 in your cloud provider's own"
echo "       firewall (GCP: check 'Allow HTTP/HTTPS traffic' on the VM;"
echo "       Oracle: add rules in the instance's Security List) — the"
echo "       VM-level ufw rules above aren't enough by themselves, every"
echo "       cloud provider has its own separate firewall in front of the VM."
echo "    3. Clone the repo here and copy .env.production.example to .env,"
echo "       filling in real values — see docs/RUNBOOK.md."
