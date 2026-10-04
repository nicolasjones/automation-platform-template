FROM apache/superset:6.1.0

USER root
RUN . /app/.venv/bin/activate && uv pip install --no-cache psycopg2-binary
# Horneados en la imagen en vez de bind-mounteados desde el host (como eran
# hasta spec 20261003-105444-cicd-staging-produccion): con DOCKER_HOST=ssh
# apuntando al daemon remoto del VPS, un bind mount relativo se resuelve
# contra el filesystem del DAEMON (el VPS), no contra el checkout del
# cliente que corre `docker compose` — en CI eso es el runner de GitHub
# Actions, que no tiene ese path en el VPS. Docker crea un directorio vacío
# ahí en vez de fallar, y Superset arranca con IsADirectoryError. El build
# sí viaja correctamente al daemon remoto (se transmite como contexto), así
# que hornear estos archivos en la imagen evita el problema de raíz.
COPY --chown=superset:superset superset_config.py crear_cuenta_servicio_guest_token.py configurar_embebido.py /app/pythonpath/
USER superset
