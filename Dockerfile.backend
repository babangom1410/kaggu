# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY packages/backend/package*.json ./packages/backend/

RUN npm install

COPY tsconfig.base.json ./
COPY packages/backend ./packages/backend

RUN npm run build:backend

# ---- Runtime stage ----
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
COPY packages/backend/package*.json ./packages/backend/

# Production deps only
RUN npm install --omit=dev

COPY --from=builder /app/packages/backend/dist ./packages/backend/dist

EXPOSE 3001
CMD ["node", "packages/backend/dist/src/index.js"]
