# Modifying and deploying the simulator

## Applying a custom header logo

The logo header image is located in viewer/img/headerLogo.png. In order to use
your own logo, simply rename you logo to "headerLogo.png" and copy it into the
viewer/img/ directory.

## Integrating custom demos

## Building and running the simulator with Docker

## Deploying to Heroku

This section contains the steps to deploy this application using Heroku - 
Container Registry.

1. Create an Heroku account
2. Download and install [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)
on your machine
3. Install docker on your machine. Verify the installation executing on a 
terminal: `$ docker ps`
4. Login into Heroku, executing on a terminal: `$ heroku login`
5. Create a Heroku app: `$ heroku create`
6. Build the image and push to Container Registry: `$ heroku container:push web`
7. Then release the image to your app: `$ heroku container:release web`
8. Now open the app in your browser: `$ heroku open`

### References:

* https://devcenter.heroku.com/articles/container-registry-and-runtime
