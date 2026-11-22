FROM mcr.microsoft.com/devcontainers/python:1-3.11-bookworm

# The base image's Yarn APT signing key can expire; this workspace does not need
# Yarn, so remove that optional repository before updating Debian package lists.
RUN find /etc/apt/sources.list.d -maxdepth 1 -iname '*yarn*' -delete \
    && apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libsndfile1 \
    && rm -rf /var/lib/apt/lists/*
