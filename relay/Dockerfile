FROM node:24-alpine
WORKDIR /app
COPY package.json server.mjs ./
USER node
EXPOSE 8787
CMD ["node", "server.mjs"]
