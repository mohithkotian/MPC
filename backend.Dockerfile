FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN chown -R node:node /app
USER node
EXPOSE 3000
ENV NODE_ENV=production
CMD ["npm", "run", "server"]
