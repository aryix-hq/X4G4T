FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache curl
COPY apps/graylog-forwarder/dist /app/apps/graylog-forwarder/dist
EXPOSE 5150
CMD ["node", "/app/apps/graylog-forwarder/dist/index.js"]
