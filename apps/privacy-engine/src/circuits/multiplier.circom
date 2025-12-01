pragma circom 2.0.0;

template Multiplier2() {
    signal input a;
    signal input b;
    signal output c;
    c <== a * b;
}

// FIX: Remove 'c' from the public list. 
// The output 'c' will be automatically treated as a public output 
// because it is the main component's output.
// We are explicitly listing the inputs 'a' and 'b' as public inputs.
component main {public [a, b]} = Multiplier2();