export var Transport;
(function (Transport) {
    Transport[Transport["TCP"] = 1] = "TCP";
    Transport[Transport["SSL"] = 2] = "SSL";
    Transport[Transport["WSS"] = 3] = "WSS";
})(Transport || (Transport = {}));
