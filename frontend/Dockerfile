FROM nginx:1.25-alpine

COPY ./nginx/default.conf /etc/nginx/conf.d/default.conf
COPY ./frontend/src /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]