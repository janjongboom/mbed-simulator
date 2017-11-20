
try {
  // Reserve an executor from node with label arm-none-eabi-gcc
  node ("arm-none-eabi-gcc") {
    // Ensure a clean build by deleting any previous Jenkins workarea
    deleteDir()
    // Add timestamps to Jenkins console log
    timestamps {
      env.MBEDOS_ROOT = pwd()
      // Define a Jenkins stage for logging purposes
      stage ("prepare environment") {
        // Create a directory and execute steps there
        dir ("mbed-client-pal") {
          // clone the sw under test, either branch or PR depending on trigger
          checkout scm
        }
        
        dir ("mbed-os") {
          git "git@github.com:ARMmbed/mbed-os"
          execute ("git checkout tags/mbed-os-5.2")
        }
        
        
        // Add mbed components
        execute ("mbed new .")

        // Execute shell command, edit file with sed


        writeFile file: 'mbed-os/features/frameworks/.mbedignore', text: '*'

      }
      
      stage ("build") {
        dir ("mbed-client-pal/Test") {
          execute ("make mbedOS_all")
        }
      }
    }
  }
} catch (error) {
    currentBuild.result = 'FAILURE'


}
