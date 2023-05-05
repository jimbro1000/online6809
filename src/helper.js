function inHex(n, l) {
    var s = n.toString(16).toUpperCase();
    while (s.length < l) {
        s = '0' + s;
    }
    return s;
}

export {inHex}