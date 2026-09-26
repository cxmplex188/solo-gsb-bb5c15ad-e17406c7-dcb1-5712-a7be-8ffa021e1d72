FROM node:20-alpine

WORKDIR /app

# 先拷贝依赖清单，利用 Docker 层缓存
COPY package.json ./
RUN npm install --omit=dev

# 拷贝应用代码
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

USER node
CMD ["node", "server.js"]
