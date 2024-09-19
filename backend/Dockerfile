# Use an official Node runtime as the base image
FROM node:22.2.0

# Set the working directory in the container
WORKDIR /usr/src/app

# Install Ghostscript
RUN apt-get update && apt-get install -y ghostscript

# Copy package.json and package-lock.json (or yarn.lock)
COPY package*.json ./

# Install dependencies
RUN npm install

# If you're building for production
# RUN npm ci --only=production

# Copy the rest of your application's code
COPY . .

# Compile TypeScript to JavaScript (if you're using TypeScript)
# RUN npm run build

# Expose the port your app runs on
EXPOSE 8080

# Define the command to run your app
CMD [ "node", "index.js" ]
