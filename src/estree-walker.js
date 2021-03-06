// modified to disable caching, which interferes with decorator function
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    factory((global.estreeWalker = {}));
}(this, function (exports) { 'use strict';

    function walk(ast, _ref) {
        var enter = _ref.enter;
        var leave = _ref.leave;

        visit(ast, null, enter, leave);
    }

    var context = {
        skip: function skip() {
            return context.shouldSkip = true;
        }
    };

    var childKeys = {};

    var toString = Object.prototype.toString;

    function isArray(thing) {
        return toString.call(thing) === '[object Array]';
    }

    function visit(node, parent, enter, leave, prop, index) {
        if (!node) return;

        if (enter) {
            context.shouldSkip = false;
            enter.call(context, node, parent, prop, index);
            if (context.shouldSkip) return;
        }

        var keys = (childKeys[node.type] = Object.keys(node).filter(function (prop) {
            return typeof node[prop] === 'object';
        }));

        var key = undefined,
            value = undefined,
            i = undefined,
            j = undefined;

        i = keys.length;
        while (i--) {
            key = keys[i];
            value = node[key];

            if (isArray(value)) {
                j = value.length;
                while (j--) {
                    visit(value[j], node, enter, leave, key, j);
                }
            } else if (value && value.type) {
                visit(value, node, enter, leave, key, null);
            }
        }

        if (leave) {
            leave(node, parent, prop, index);
        }
    }

    exports.walk = walk;

}));
//# sourceMappingURL=estree-walker.umd.js.map