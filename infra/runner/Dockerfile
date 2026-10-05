FROM ubuntu:24.04

ARG RUNNER_VERSION=2.337.0
ARG SCOUT_VERSION=1.26.0
# El runner de GitHub se niega a correr como root por default; en este
# contenedor corre como root a propósito para poder usar el socket de
# Docker montado del host sin pelear con permisos de grupo.
ENV RUNNER_ALLOW_RUNASROOT=1

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates jq git gnupg lsb-release \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
      > /etc/apt/sources.list.d/docker.list \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get update && apt-get install -y --no-install-recommends \
      docker-ce-cli docker-compose-plugin docker-buildx-plugin nodejs \
      postgresql-client libtap-parser-sourcehandler-pgtap-perl \
      openssh-client \
    && npm install -g pnpm@11.19.0 \
    && rm -rf /var/lib/apt/lists/*
# docker-buildx-plugin: worker-images.yml exige provenance y SBOM (docker
# buildx build --provenance=true --sbom=true), sin él falla en main.
# docker-scout-plugin no existe como paquete apt del repo oficial de Docker
# (confirmado 2026-10-05, "E: Unable to locate package"); worker-images.yml
# también exige `docker scout version` para bloquear vulnerabilidades. El
# instalador oficial (curl | sh, sin set -e) no deja el binario instalado
# de forma confiable durante un docker build (probablemente por el límite
# de tasa de la API de GitHub sin autenticación) sin que el build se entere
# del fallo — mismo criterio que RUNNER_VERSION arriba: tarball pineado por
# versión en vez de un script de terceros.
RUN curl -fsSL -o scout.tar.gz \
      "https://github.com/docker/scout-cli/releases/download/v${SCOUT_VERSION}/docker-scout_${SCOUT_VERSION}_linux_amd64.tar.gz" \
    && mkdir -p /root/.docker/cli-plugins \
    && tar xzf scout.tar.gz -C /root/.docker/cli-plugins docker-scout \
    && chmod +x /root/.docker/cli-plugins/docker-scout \
    && rm -f scout.tar.gz
# openssh-client: el job de deploy de infraestructura del VPS (spec
# 20261003-105444-cicd-staging-produccion) controla el Docker remoto del VPS
# vía DOCKER_HOST=ssh://usuario@host — el CLI de Docker delega en el binario
# `ssh` del sistema, que esta imagen no traía.
# pg_prove (del paquete pgtap de arriba) corre los tests pgTAP directo
# contra el Postgres del host (via host.docker.internal), sin pasar por
# el contenedor interno que arma "supabase test db" — ese contenedor
# anidado no puede montar los .sql del checkout porque esa ruta solo
# existe dentro de este contenedor, no en el host real (Docker-fuera-de-
# Docker no traduce paths de un contenedor a otro).

WORKDIR /home/runner
RUN curl -fsSL -o actions-runner.tar.gz \
      "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz" \
    && tar xzf actions-runner.tar.gz && rm actions-runner.tar.gz \
    && ./bin/installdependencies.sh

COPY entrypoint.mjs /entrypoint.mjs
RUN chmod 0555 /entrypoint.mjs

ENTRYPOINT ["node", "/entrypoint.mjs"]
