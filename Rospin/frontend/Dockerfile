# Frontend - Vite + React build with Nginx
FROM node:18 as build

WORKDIR /app
COPY package*.json ./
RUN npm install

ARG VITE_GOOGLE_MAPS_API_KEY
ARG VITE_API_URL
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY
ENV VITE_API_URL=$VITE_API_URL

COPY . .
RUN npm run build

# --- Nginx stage ---
FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY /nginx-spa.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]


