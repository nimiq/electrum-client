export var ConsensusState;
(function (ConsensusState) {
    ConsensusState["CONNECTING"] = "connecting";
    ConsensusState["SYNCING"] = "syncing";
    ConsensusState["ESTABLISHED"] = "established";
})(ConsensusState || (ConsensusState = {}));
export var TransactionState;
(function (TransactionState) {
    TransactionState["NEW"] = "new";
    TransactionState["PENDING"] = "pending";
    TransactionState["MINED"] = "mined";
    TransactionState["INVALIDATED"] = "invalidated";
    TransactionState["CONFIRMED"] = "confirmed";
})(TransactionState || (TransactionState = {}));
