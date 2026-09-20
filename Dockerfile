FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY requirements.txt ./
RUN python3 -m venv /opt/venv \
  && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

COPY server.js matching_service.py ./

ENV NODE_ENV=production
ENV PYTHON_BIN=/opt/venv/bin/python

EXPOSE 3000
CMD ["npm", "run", "backend"]
