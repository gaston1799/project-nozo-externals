/* Packet/socket foundation for NozoNext. No gameplay logic. */
(function () {
    "use strict";

    const root = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
    const Nozo = root.NozoNext = root.NozoNext || {};

    const maxHistory = (Nozo.constants && Nozo.constants.MAX_LOG) || 64;
    const history = [];

    function _record(type, dataArray, tag) {
        history.push({ type: type, data: dataArray, tag: tag || null, t: Date.now() });
        if (history.length > maxHistory) history.shift();
    }

    const net = {
        setSocket: function setSocket(ws) {
            Nozo.state = Nozo.state || {};
            Nozo.state.WS = ws;
        },

        getSocket: function getSocket() {
            return (Nozo.state && Nozo.state.WS) || null;
        },

        encodePacket: function encodePacket(type, dataArray) {
            if (!root.msgpack) return null;
            return root.msgpack.encode([type, dataArray]);
        },

        sendPacket: function sendPacket(type) {
            const args = Array.prototype.slice.call(arguments, 1);
            return net.sendPacketData(type, args);
        },

        sendPacketData: function sendPacketData(type, dataArray) {
            const ws = net.getSocket();
            if (!ws || ws.readyState !== WebSocket.OPEN) return false;
            if (!root.msgpack) return false;
            if (!Array.isArray(dataArray)) return false;
            const binary = root.msgpack.encode([type, dataArray]);
            ws.send(binary);
            return true;
        },

        sendDirection: function sendDirection(angle, tag) {
            const numericAngle = Number(angle);
            if (!isFinite(numericAngle)) return false;
            _record("D", [numericAngle], tag);
            if (Nozo.log) Nozo.log("packet:D", { angle: numericAngle, tag: tag || null, t: Date.now() });
            return net.sendPacketData("D", [numericAngle]);
        },

        sendMove: function sendMove(angle, extra) {
            _record("9", [angle, extra], "move");
            if (Nozo.log) Nozo.log("packet:9", { angle: angle, extra: extra, t: Date.now() });
            return net.sendPacket("9", angle, extra);
        },

        sendGather: function sendGather() {
            _record("K", [1, 1], "gather");
            if (Nozo.log) Nozo.log("packet:K", { t: Date.now() });
            return net.sendPacket("K", 1, 1);
        },

        sendAttackPacketUnsafe: function sendAttackPacketUnsafe() {
            // Opt-in stub reserved for Phase 6. Must not be called by any code path.
            return false;
        },

        getHistory: function getHistory() {
            return history.slice();
        }
    };

    Nozo.packet = net;
    Nozo.modules = Nozo.modules || {};
    Nozo.modules.packet = net;
})();
