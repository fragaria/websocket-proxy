FROM node:13-alpine

ENV ADDRESS 0.0.0.0
ENV PORT 8090
ENV KEY_SERVER_URL ''
ENV KEY_SERVER_IGNORE_FOR_HOSTNAMES ''
ENV VERBOSITY 3

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

# RUN npm install
# If you are building your code for production
RUN npm ci --only=production

# Bundle app source
COPY . .

EXPOSE $PORT
CMD [ "node", "server" ]
