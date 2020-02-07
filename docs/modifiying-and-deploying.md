# Modifying and deploying the simulator

## Applying a custom header logo

The logo header image is located in viewer/img/headerLogo.png. In order to use
your own logo, simply rename you logo to "headerLogo.png" and copy it into the
viewer/img/ directory.

## Integrating custom demos

The demos can be found in the demos directory. Replace the contents of this
directory for your own demos for them to be built into the simulator. For each
demo, you must create a simconfig.json file. `name` is the only required field
\- see demos directory for examples of how this should look.

## Building and running the simulator with Docker locally

1. Make sure Docker is installed.
1. Build the simulator image:
```
docker build -t mbed/simulator
```
1. Run the simulator container:
```
docker run -p 7829:7829 mbed/simulator
```

## Deploying to Heroku

You can deploy the simulator to Heroku using the Heroku Container Registry.

1. Create an Heroku account
1. Download and install [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)
on your machine
1. Install docker on your machine. Verify the installation executing on a
terminal:
```
$ docker -v
```
1. Login into Heroku CLI and the container registry, executing on a terminal:
```
$ heroku login
```
1. Create a Heroku app:
```
$ heroku create <name-of-your-app>
```
1. Login to the container registry:
```
$ heroku container:login
```
1. Build the image and push to container registry (it will take a while to build the Docker image and push to the registry):
```
$ heroku container:push web -a <name-of-your-app>
```
1. Then release the image to your app:
```
$ heroku container:release web -a <name-of-your-app>
```
1. Now open the app in your browser:
```
$ heroku open -a <name-of-your-app>
```
