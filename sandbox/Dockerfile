# Sandbox container image for Phase 3 worker execution.
# Minimal, network-isolated, read-only except /workspace. No shell tools,
# no curl/git/pip, no outbound HTTP. The runner reads a job spec and emits
# result JSON on stdout.

# Fetch the officecli linux-x64 binary in a throwaway stage so the final
# image stays free of curl/wget; the native binary is self-contained.
FROM alpine:3.20 AS officecli-fetch
ARG OFFICECLI_VERSION=v1.0.135
ARG OFFICECLI_SHA256=00028af3db48678fc9ff6c8f9e70fa4c150dcee2b43ed85254afc8f4a48e13eb
RUN apk add --no-cache curl ca-certificates \
 && curl -fsSL -o /usr/local/bin/officecli \
      "https://github.com/iOfficeAI/OfficeCLI/releases/download/${OFFICECLI_VERSION}/officecli-linux-x64" \
 && echo "${OFFICECLI_SHA256}  /usr/local/bin/officecli" | sha256sum -c - \
 && chmod 0755 /usr/local/bin/officecli

FROM python:3.12-slim

# Container-side libraries aligned with agent_script_service.SCRIPT_IMPORT_ALLOWLIST
# plus the pdf tabular parsing needed by file-producing workers.
RUN pip install --no-cache-dir \
        pandas==2.2.3 \
        openpyxl==3.1.5 \
        pypdf2==3.0.1 \
        pdfplumber==0.11.4 \
        tabulate==0.9.0 \
    && rm -rf /root/.cache /tmp/*

# OfficeCLI native binary; OFFICECLI_SKIP_UPDATE keeps the container network-quiet.
COPY --from=officecli-fetch /usr/local/bin/officecli /usr/local/bin/officecli
ENV OFFICECLI_SKIP_UPDATE=1

# Non-root user; the host bind-mounts the agent workspace read-write.
RUN useradd --create-home --shell /bin/false sandbox
USER sandbox
WORKDIR /workspace

COPY sandbox/runner.py /runner.py

ENTRYPOINT ["python", "/runner.py"]
# Sandbox container image for Phase 3 worker execution.
# Minimal, network-isolated, read-only except /workspace. No shell tools,
# no curl/git/pip, no outbound HTTP. The runner reads a job spec and emits
# result JSON on stdout.

# Fetch the officecli linux-x64 binary in a throwaway stage so the final
# image stays free of curl/wget; the native binary is self-contained.
FROM alpine:3.20 AS officecli-fetch
ARG OFFICECLI_VERSION=v1.0.135
ARG OFFICECLI_SHA256=00028af3db48678fc9ff6c8f9e70fa4c150dcee2b43ed85254afc8f4a48e13eb
RUN apk add --no-cache curl ca-certificates \
 && curl -fsSL -o /usr/local/bin/officecli \
      "https://github.com/iOfficeAI/OfficeCLI/releases/download/${OFFICECLI_VERSION}/officecli-linux-x64" \
 && echo "${OFFICECLI_SHA256}  /usr/local/bin/officecli" | sha256sum -c - \
 && chmod 0755 /usr/local/bin/officecli

FROM python:3.12-slim

# Container-side libraries aligned with agent_script_service.SCRIPT_IMPORT_ALLOWLIST
# plus the pdf tabular parsing needed by file-producing workers.
RUN pip install --no-cache-dir \
        pandas==2.2.3 \
        openpyxl==3.1.5 \
        pypdf2==3.0.1 \
        pdfplumber==0.11.4 \
        tabulate==0.9.0 \
    && rm -rf /root/.cache /tmp/*

# OfficeCLI native binary; OFFICECLI_SKIP_UPDATE keeps the container network-quiet.
COPY --from=officecli-fetch /usr/local/bin/officecli /usr/local/bin/officecli
ENV OFFICECLI_SKIP_UPDATE=1

# Non-root user; the host bind-mounts the agent workspace read-write.
RUN useradd --create-home --shell /bin/false sandbox
USER sandbox
WORKDIR /workspace

COPY sandbox/runner.py /runner.py

ENTRYPOINT ["python", "/runner.py"]
