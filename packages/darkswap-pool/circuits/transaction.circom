pragma circom 2.1.9;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "./merkleProof.circom";
include "./keypair.circom";

/*
DarkSwap join-split: spend up to nIns notes, create nOuts notes, one asset.

Note        = (amount, assetId, publicKey, blinding)
commitment  = Poseidon(amount, assetId, publicKey, blinding)
publicKey   = Poseidon(privateKey)
signature   = Poseidon(privateKey, commitment, pathIndex)
nullifier   = Poseidon(commitment, pathIndex, signature)

The proof shows, without revealing which notes are spent:
  1. every input note with a non-zero amount is in the tree under `root`;
  2. the prover knows the spending key of every input note;
  3. each public nullifier belongs to its input note, and no two are equal;
  4. each public output commitment is well formed and its amount fits 248 bits;
  5. sum(inputs) + publicAmount == sum(outputs)   (in the field);
  6. every note in the transaction has the same assetId;
  7. if value crosses the pool boundary (publicAmount != 0), that assetId is
     the public one. A pure transfer (publicAmount == 0) hides the asset.

`publicAmount` is a field element set by the pool: +amount on a shield made
through this circuit, and (p - amount - fee) on an unshield. The pool, not the
circuit, bounds the external amount and the fee.

`extDataHash` binds everything the proof must not be replayed with: recipient,
relayer, fee, encrypted outputs, chain and pool. The pool recomputes it.
*/
template Transaction(levels, nIns, nOuts) {
    // ---- public ----
    signal input root;
    signal input publicAmount;
    signal input extDataHash;
    signal input publicAssetId;
    signal input inputNullifier[nIns];
    signal input outputCommitment[nOuts];

    // ---- private ----
    signal input assetId;

    signal input inAmount[nIns];
    signal input inPrivateKey[nIns];
    signal input inBlinding[nIns];
    signal input inPathIndex[nIns];
    signal input inPathElements[nIns][levels];

    signal input outAmount[nOuts];
    signal input outPublicKey[nOuts];
    signal input outBlinding[nOuts];

    component inKeypair[nIns];
    component inCommitment[nIns];
    component inSignature[nIns];
    component inNullifier[nIns];
    component inTree[nIns];
    component inRootCheck[nIns];
    var sumIns = 0;

    for (var i = 0; i < nIns; i++) {
        inKeypair[i] = Keypair();
        inKeypair[i].privateKey <== inPrivateKey[i];

        inCommitment[i] = Poseidon(4);
        inCommitment[i].inputs[0] <== inAmount[i];
        inCommitment[i].inputs[1] <== assetId;
        inCommitment[i].inputs[2] <== inKeypair[i].publicKey;
        inCommitment[i].inputs[3] <== inBlinding[i];

        inSignature[i] = Signature();
        inSignature[i].privateKey <== inPrivateKey[i];
        inSignature[i].commitment <== inCommitment[i].out;
        inSignature[i].pathIndex <== inPathIndex[i];

        inNullifier[i] = Poseidon(3);
        inNullifier[i].inputs[0] <== inCommitment[i].out;
        inNullifier[i].inputs[1] <== inPathIndex[i];
        inNullifier[i].inputs[2] <== inSignature[i].out;
        inNullifier[i].out === inputNullifier[i];

        inTree[i] = MerkleProof(levels);
        inTree[i].leaf <== inCommitment[i].out;
        inTree[i].pathIndex <== inPathIndex[i];
        for (var j = 0; j < levels; j++) {
            inTree[i].pathElements[j] <== inPathElements[i][j];
        }

        // Membership is enforced only for notes that carry value, so a
        // transaction with fewer real inputs pads with zero-amount notes.
        inRootCheck[i] = ForceEqualIfEnabled();
        inRootCheck[i].in[0] <== root;
        inRootCheck[i].in[1] <== inTree[i].root;
        inRootCheck[i].enabled <== inAmount[i];

        sumIns += inAmount[i];
    }

    component outCommitment[nOuts];
    component outAmountBits[nOuts];
    var sumOuts = 0;

    for (var i = 0; i < nOuts; i++) {
        outCommitment[i] = Poseidon(4);
        outCommitment[i].inputs[0] <== outAmount[i];
        outCommitment[i].inputs[1] <== assetId;
        outCommitment[i].inputs[2] <== outPublicKey[i];
        outCommitment[i].inputs[3] <== outBlinding[i];
        outCommitment[i].out === outputCommitment[i];

        // 248 bits keeps the sum of all amounts far below the field size, so
        // the balance equation cannot wrap around.
        outAmountBits[i] = Num2Bits(248);
        outAmountBits[i].in <== outAmount[i];

        sumOuts += outAmount[i];
    }

    // No nullifier may appear twice in one transaction.
    component sameNullifier[nIns * (nIns - 1) / 2];
    var k = 0;
    for (var i = 0; i < nIns - 1; i++) {
        for (var j = i + 1; j < nIns; j++) {
            sameNullifier[k] = IsEqual();
            sameNullifier[k].in[0] <== inputNullifier[i];
            sameNullifier[k].in[1] <== inputNullifier[j];
            sameNullifier[k].out === 0;
            k++;
        }
    }

    // Value is conserved.
    sumIns + publicAmount === sumOuts;

    // The asset is public exactly when value crosses the pool boundary.
    publicAmount * (assetId - publicAssetId) === 0;

    // Bind extDataHash into the proof so it cannot be swapped after proving.
    signal extDataSquare <== extDataHash * extDataHash;
}
