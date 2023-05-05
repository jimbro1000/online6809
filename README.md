# Motorola 6809 Emulator #

This is an update to Gwilym Thomas' emulator as hosted at
http://6809.uk

Since Gwilym originally published the emulator it has become
apparent that there are some issues with both the compiler
and the emulator. Unfortunately I've been unable to contact
Gwilym, so I've just updated the code to fix issues myself

The revised emulator is hosted at http://6809.ukdragons.org.uk

A copy of the original wiki is hosted in the [wiki for this 
repository](https://github.com/jimbro1000/online6809/wiki)

## How to Build ##

Some testing is implemented, currently enough to replicate
error scenarios and verify any fixes. To run the test
suite use the npm test script, or execute `npx jest` from
a command line in the root of the project.

To build the script bundle use the npm build script. This
regenerates the build.js file under the dist folder. It 
also aggregates the solution into a single html file in
the root folder.

## Running the Emulator ##

Provided a build cycle has completed the emulator can be
run as either the single file solution in the root of the
folder or by opening index.html in the src folder. Both
variants should work.

## Debug ##

If you need to debug the solution it is vital to set the
webpack.config.js file to use the development mode instead
of production. This prevents obfuscation and minification 
of the source scripts. 

## Known Issues ##

* The compiler attempts to resolve relative branching within a
fixed two pass execution which results in some offsets being
incorrect. Temporary fix applied by extending to three passes 
but this needs revisiting to dynamically adjust the number of
passes to allow offsets to settle (or error if oscillating 
indefinitely)
* Data literals have issues with handling of strings and when
the literal contains a match with a label or mnemonic token. 
Until fixed make sure labels end with a ":" to help differentiate