# Stage 1: Build the Vite app
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_API_BASE=
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build

# Stage 2: Serve with unprivileged nginx (+ proxy /api/* to backend)
FROM nginxinc/nginx-unprivileged:alpine
ENV BACKEND_URL=http://backend:3000
ENV BACKEND_HOST=backend:3000
ENV NGINX_ENVSUBST_TEMPLATE_VARS="BACKEND_URL BACKEND_HOST"
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY security-headers.conf /etc/nginx/conf.d/security-headers.conf
USER nginx
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
