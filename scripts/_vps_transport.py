#!/usr/bin/env python3
"""SSH/SFTP helpers for deploy-vps.sh when sshpass is unavailable."""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    import paramiko
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "paramiko"])
    import paramiko


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip().strip("\r")


def _client() -> paramiko.SSHClient:
    host = _env("VPS_HOST")
    if not host:
        raise SystemExit("VPS_HOST is empty — check .deploy.env")
    user = _env("VPS_USER", "root")
    password = _env("VPS_PASSWORD")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, password=password, timeout=30)
    return client


def run_remote(cmd: str, timeout: int = 900) -> int:
    client = _client()
    try:
        _stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
        code = stdout.channel.recv_exit_status()
        out = stdout.read().decode()
        err = stderr.read().decode()
        if out:
            sys.stdout.write(out)
        if err:
            sys.stderr.write(err)
        return code
    finally:
        client.close()


def rsync_dir(local: str, remote: str) -> None:
    """Pack directory as tar.gz, upload once, extract on server (fast for many files)."""
    local_path = Path(local).resolve()
    remote = remote.rstrip("/")
    remote_parent = str(Path(remote).parent)

    with tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False) as tmp:
        tar_path = tmp.name

    try:
        subprocess.check_call(
            ["tar", "-czf", tar_path, "-C", str(local_path.parent), local_path.name],
            stdout=subprocess.DEVNULL,
        )
        remote_tar = f"/tmp/ma-deploy-{os.getpid()}.tar.gz"
        client = _client()
        try:
            sftp = client.open_sftp()
            sftp.put(tar_path, remote_tar)
            sftp.close()
        finally:
            client.close()

        run_remote(
            f"rm -rf {remote} && mkdir -p {remote_parent} && "
            f"tar -xzf {remote_tar} -C {remote_parent} && rm -f {remote_tar}"
        )
    finally:
        Path(tar_path).unlink(missing_ok=True)


def upload_file(local: str, remote: str) -> None:
    client = _client()
    try:
        sftp = client.open_sftp()
        sftp.put(local, remote)
        sftp.close()
    finally:
        client.close()


def main() -> None:
    action = sys.argv[1]
    if action == "run":
        sys.exit(run_remote(sys.argv[2]))
    if action == "rsync":
        rsync_dir(sys.argv[2], sys.argv[3])
        return
    if action == "upload":
        upload_file(sys.argv[2], sys.argv[3])
        return
    raise SystemExit(f"unknown action: {action}")


if __name__ == "__main__":
    main()
