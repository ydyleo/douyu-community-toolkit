ARG DOCKER_LIBRARY=public.ecr.aws/docker/library
FROM ${DOCKER_LIBRARY}/node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG NUXT_PUBLIC_API_BASE=
ARG XIAOGUI_USERSCRIPT_API_BASE=https://9765366.cn
ENV NUXT_PUBLIC_API_BASE=$NUXT_PUBLIC_API_BASE
RUN npx nuxt prepare && npm run generate \
  && sed -i "s|http://127.0.0.1:4000|${XIAOGUI_USERSCRIPT_API_BASE}|g" .output/public/userscripts/nishuixiaogui-meme-helper.user.js

FROM ${DOCKER_LIBRARY}/nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/.output/public /usr/share/nginx/html
EXPOSE 80
