FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY server ./server

ENV ATLAS_PUBLIC_DIR=/app/dist
ENV ATLAS_STATE_PATH=/data/campaign.json
ENV PORT=80

VOLUME ["/data"]
EXPOSE 80

CMD ["node", "server/index.mjs"]
