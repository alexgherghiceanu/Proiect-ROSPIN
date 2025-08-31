# Frontend - Vite + React build with Nginx
FROM node:18 as build

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# --- Nginx stage ---
FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY /nginx-spa.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
