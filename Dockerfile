FROM node:16-alpine
RUN npm install -g pnpm
WORKDIR /app
COPY package.json .
COPY pnpm-lock.yaml .
RUN pnpm install
COPY . .
RUN pnpm run build
RUN pnpm prune --prod
CMD [ "pnpm", "run", "start" ]