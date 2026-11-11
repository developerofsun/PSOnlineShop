# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# The admin calls /api and /uploads on its own origin; nginx proxies those to the API.
ARG VITE_STOREFRONT_URL=/
ENV VITE_STOREFRONT_URL=$VITE_STOREFRONT_URL

RUN npm run build

# ---- runtime ----
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
