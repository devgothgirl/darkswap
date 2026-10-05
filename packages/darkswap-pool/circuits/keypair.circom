pragma circom 2.1.9;

include "../node_modules/circomlib/circuits/poseidon.circom";

// A spending key is one field element. Its public key is Poseidon(privateKey).
template Keypair() {
    signal input privateKey;
    signal output publicKey;

    component hasher = Poseidon(1);
    hasher.inputs[0] <== privateKey;
    publicKey <== hasher.out;
}

// Proves knowledge of the spending key for one specific note position.
// signature = Poseidon(privateKey, commitment, pathIndex)
template Signature() {
    signal input privateKey;
    signal input commitment;
    signal input pathIndex;
    signal output out;

    component hasher = Poseidon(3);
    hasher.inputs[0] <== privateKey;
    hasher.inputs[1] <== commitment;
    hasher.inputs[2] <== pathIndex;
    out <== hasher.out;
}
