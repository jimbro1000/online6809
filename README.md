# Motorola 6809 Emulator #

This is an update to Gwilym Thomas' emulator as hosted at
http://6809.uk

Since Gwilym originally published the emulator it has become
apparent that there are some issues with both the compiler
and the emulator. Unfortunately I've been unable to contact
Gwilym, so I've just updated the code to fix issues myself

The revised emulator is hosted at http://6809.ukdragons.org.uk

## Issues ##

* The compiler attempts to resolve relative branching within a
fixed two pass execution which results in some offsets being
incorrect. Temporary fix applied by extending to three passes 
but this needs revisiting to dynamically adjust the number of
passes to allow offsets to settle (or error if oscillating 
indefinitely)
* Links to the emulator documentation are broken. The original
documents are held in a doku wiki on the original site (maintained
by 'reggie' - no idea who that is). The revised site does not
provide dynamic content so it either needs to link to the
original or host a snapshot
* Effective addressing modes are showing incorrect results in
some scenarios
