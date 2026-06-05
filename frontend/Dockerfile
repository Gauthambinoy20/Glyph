# Stage 1: build the static site with Vite.
FROM node:20-alpine AS build
WORKDIR /app
# Install dependencies from the lockfile first so this layer caches across code changes.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: serve the built files with a tiny nginx, proxying /api to the backend.
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
