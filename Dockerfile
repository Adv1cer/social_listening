FROM node:24-slim AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build
RUN npx playwright install --with-deps chromium
EXPOSE 8000
CMD ["node", "dist/server.js"]
