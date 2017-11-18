var editor = ace.edit("editor");
editor.setTheme("ace/theme/textmate");
editor.getSession().setMode("ace/mode/c_cpp");

document.querySelector('#load-demo').onclick = function() {
    var sp = document.querySelector('#select-project');
    var demo = sp.options[sp.selectedIndex].getAttribute('name');
    var x = new XMLHttpRequest();
    x.onload = function() {
        if (x.status === 200) {
            editor.setValue(x.responseText);
            editor.selection.clearSelection();
            editor.selection.moveCursorTo(0, 0);

            document.querySelector('iframe').src = '/view/' + demo;
        }
        else {
            alert('Failed to compile, see browser console...');
            console.error('Failed to load demo...', x.status);
        }
    };
    x.open('GET', '/demos/' + demo + '/main.cpp');
    x.send();
};

document.querySelector('#run').onclick = function() {
    var btn = this;
    btn.disabled = 'disabled';

    var status = document.querySelector('#run-status');
    status.textContent = 'Compiling...';

    var x = new XMLHttpRequest();
    x.onload = function() {
        btn.removeAttribute('disabled');

        if (x.status === 200) {
            document.querySelector('iframe').src = '/view/' + x.responseText;
            status.textContent = '';
        }
        else {
            console.error('Compilation failed', x.status);
            console.error(x.responseText);

            status.textContent = 'Compilation failed, see console!';
        }
    };
    x.open('POST', '/compile');
    x.setRequestHeader('Content-Type', 'application/json');
    x.send(JSON.stringify({ code: editor.getValue() }));
}
