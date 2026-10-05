pragma circom 2.1.9;

include "./transaction.circom";

// Tree depth 26 (about 67 million notes), 2 notes in, 2 notes out.
// Changing any of these three numbers changes the verifying key.
component main {
    public [root, publicAmount, extDataHash, publicAssetId, inputNullifier, outputCommitment]
} = Transaction(26, 2, 2);
