# Static bundle served by nginx (Cloud Run, or any container host). Build: docker build -t pathshala .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
# Cloud Run sets $PORT; the nginx image substitutes it into the template
ENV PORT=8080
EXPOSE 8080
