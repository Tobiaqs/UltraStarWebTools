(() => {
    let fileName;
    let fileContents;
    let notes;
    let cursor;

    function updateUI () {
        document.querySelector('#number-of-notes').innerText = notes ? notes.length : '';
        document.querySelector('#cursor-position').innerText = typeof cursor === 'number' ? cursor : '';
        document.querySelector('#current-note-text').innerText = notes ? notes[cursor].text : '';
    };

    function resetUltraStarFile () {
        document.querySelector('#ultrastar-file').value = null;
        fileName = null;
        fileContents = null;
        notes = null;
        cursor = null;
        updateUI();
    }

    function downloadText (filename, data) {
        const blob = new Blob([data], { type: 'text/plain' });
        const elem = document.createElement('a');
        elem.href = URL.createObjectURL(blob);
        elem.download = filename;        
        document.body.appendChild(elem);
        elem.click();        
        document.body.removeChild(elem);
    };

    function exportNow () {
        if (!notes) {
            alert('No file has been loaded yet');
            return;
        }
        const lines = fileContents.split('\n');
        const outputLines = [];
        let exportCursor = 0;

        lines.forEach((line) => {
            line = line.trim();

            if (line.startsWith(':') || line.startsWith('*')) {
                const params = line.split(' ', 4);
                const suffix = line.substr(params.join(' ').length);
                params[1] = notes[exportCursor].time.toString();
                if (notes[exportCursor].start_s && notes[exportCursor].end_s) {
                    params[2] = Math.round((notes[exportCursor].end_s - notes[exportCursor].start_s) * 100);
                } else {
                    params[2] = notes[exportCursor].duration.toString();
                }
                params[3] = notes[exportCursor].note.toString();
                line = params.join(' ') + suffix;

                exportCursor ++;
            }

            outputLines.push(line);
        });

        outputLines.forEach((line, idx) => {
            if (line.startsWith('-')) {
                const prevTime = parseInt(outputLines[idx - 1].split(' ', 4)[1], 10);
                const nextTime = parseInt(outputLines[idx + 1].split(' ', 4)[1], 10);
                outputLines[idx] = '- ' + Math.round(nextTime - ((nextTime - prevTime) / 2));
            }
        });

        downloadText(fileName, outputLines.join('\n') + '\n');
    };

    function onSongLoaded (filename, text) {
        fileName = filename;
        fileContents = text;
        notes = [];
        cursor = 0;

        // Notes are * or :
        // 0 = C = 72 = 60
        const lines = text.split('\n');

        lines.forEach((line) => {
            line = line.trim();
            if (line.startsWith(':') || line.startsWith('*')) {
                const params = line.split(' ', 4);
                notes.push({
                    time: parseInt(params[1], 10),
                    duration: parseInt(params[2], 10),
                    note: parseInt(params[3], 10),
                    text: line.substr(params.join(' ').length + 1)
                });
            }
        });

        document.body.classList.add('file-ready');

        updateUI();
    };

    function onKeyRegistered (key) {
        if (!notes) {
            return;
        }

        // Always store key pressed (for recording end times)
        notes[cursor].key = key;

        if (document.querySelector('#record-notes').checked) {
            notes[cursor].note = key - 60;
        }

        if (document.querySelector('#record-times').checked && !document.querySelector('#mp3-player').paused && document.querySelector('#mp3-player').currentTime !== 0) {
            // 1 beat = 10 ms (6000 bpm)
            notes[cursor].start_s = document.querySelector('#mp3-player').currentTime;
            notes[cursor].end_s = null;
            notes[cursor].time = Math.round(document.querySelector('#mp3-player').currentTime * 100);
        }

        nextNote();
    };

    function prevNote () {
        if (cursor > 0) {
            cursor --;
            updateUI();
        }
    };

    function nextNote () {
        if (cursor < notes.length - 1) {
            cursor ++;
            updateUI();
        }
    };

    let pitchBendFlag = false;

    function onMIDIMessage (message) {
        // pitch bend nav mechanism
        if (message.data[0] === 224) {
            const value = message.data[2];
            if (value === 64) {
                pitchBendFlag = false;
            } else if (!pitchBendFlag && value > 64) {
                pitchBendFlag = true;
                nextNote();
                if (!document.querySelector('#mp3-player').paused) {
                    document.querySelector('#mp3-player').currentTime = Math.max(notes[cursor].start_s - document.querySelector('#mp3-player').playbackRate, 0);
                }
                updateUI();
            } else if (!pitchBendFlag && value < 64) {
                pitchBendFlag = true;
                prevNote();
                if (!document.querySelector('#mp3-player').paused) {
                    document.querySelector('#mp3-player').currentTime = Math.max(notes[cursor].start_s - document.querySelector('#mp3-player').playbackRate, 0);
                }
                updateUI();
            }

            return;
        }

        // key release & recording times
        if (message.data[2] === 0 && document.querySelector('#record-times').checked && !document.querySelector('#mp3-player').paused && document.querySelector('#mp3-player').currentTime !== 0) {
            for (let i = cursor; i >= 0; i--) {
                if (notes[i].start_s && !notes[i].end_s && notes[i].key === message.data[1]) {
                    notes[i].end_s = document.querySelector('#mp3-player').currentTime;
                }
            }
            return;
        }

        // if sync, pitch bend, pitch bend, no keypress, or key release respectively, ignore the message
        if (message.data[0] === 254 || message.data[0] === 225 || message.data[0] === 226 || message.data.length !== 3 || message.data[2] === 0) {
            return;
        }

        const key = message.data[1];

        onKeyRegistered(key);
    };

    window.addEventListener('load', () => {
        document.querySelector('#request-midi-btn').addEventListener('click', (event) => {
            navigator.requestMIDIAccess({
                sysex: false
            }).then((access) => {
                const input = [...access.inputs.values()].find((input) => input.name.startsWith("YAMAHA"));
                input.addEventListener('midimessage', onMIDIMessage);
                event.target.disabled = true;
                event.target.innerText = 'MIDI connected';
            });
        });

        document.querySelector('#import-lyrics').addEventListener('click', () => {
            if (!notes) {
                alert('No file has been loaded yet');
                return;
            }

            const lines = fileContents.split('\n');
    
            lyricLines = [''];
            lines.forEach((line) => {
                line = line.trim();
                
                if (line.startsWith(':') || line.startsWith('*') || line.startsWith('F') || line.startsWith('R')) {
                    const params = line.split(' ', 4);
                    const text = line.substr(params.join(' ').length + 1);
                    if (text.startsWith(' ')) {
                        lyricLines[lyricLines.length - 1] += text;
                    } else {
                        if (lyricLines[lyricLines.length - 1] === '') {
                            lyricLines[lyricLines.length - 1] = text;
                        } else {
                            lyricLines[lyricLines.length - 1] += '+' + text;
                        }
                    }
                } else if (line.startsWith('-')) {
                    lyricLines.push('');
                }
            });

            document.querySelector('#lyrics').value = lyricLines.join('\n') + '\n';
            resetUltraStarFile();
        });

        document.querySelector('#ultrastar-file').addEventListener('change', (event) => {
            if (event.target.files.length !== 1) {
                return;
            }

            const reader = new FileReader();
            reader.addEventListener('load', () => {
                const text = reader.result;
                onSongLoaded(event.target.files[0].name, text);
            });
            reader.readAsText(event.target.files[0]);
        });

        document.querySelector('#export-now-btn').addEventListener('click', exportNow);

        document.querySelector('#mp3-file').addEventListener('change', (event) => {
            if (event.target.files.length !== 1) {
                return;
            }
            const playbackRate = document.querySelector('#mp3-player').playbackRate;
            const url = URL.createObjectURL(event.target.files[0]);
            document.querySelector('#mp3-player').src = url;
            document.querySelector('#mp3-player').playbackRate = playbackRate;
        });

        document.querySelector('#set-playback-rate').addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                document.querySelector('#mp3-player').playbackRate = parseFloat(event.target.value);
                console.log(document.querySelector('#mp3-player').playbackRate);
                document.querySelector('#playback-rate').innerHTML = document.querySelector('#mp3-player').playbackRate.toFixed(2);
            }
        });

        document.querySelector('#import-ultrastar-file').addEventListener('click', () => {
            if (document.querySelector('#lyrics').value === '') {
                return;
            }

            const lyricLines = document.querySelector('#lyrics').value.trim().split('\n');
            sentences = [];
            lyricLines.forEach((line) => {
                line = line.trim();

                if (line.length === 0) {
                    return;
                }

                const sentence = [];
                const words = line.split(' ');

                words.forEach((word) => {
                    const segments = word.split('+');
                    if (sentence.length === 0) {
                        sentence.push(segments[0]);
                    } else {
                        sentence.push(' ' + segments[0]);
                    }
                    segments.slice(1).forEach((segment) => {
                        sentence.push(segment);
                    });
                });

                sentences.push(sentence);
            });

            lines = [
                '#TITLE:Imported',
                '#ARTIST:Imported',
                '#CREATOR:UltraStar WebTools - https://uswt.tobiass.nl',
                '#BPM:1500', // 10 ms precision
                '#GAP:0'
            ];

            sentences.forEach((sentence, idx) => {
                sentence.forEach((segment) => {
                    lines.push(': 0 0 0 ' + segment);
                });
                if (idx !== sentences.length - 1) {
                    lines.push('- 0');
                }
            });
            
            resetUltraStarFile();
            onSongLoaded('imported.txt', lines.join('\n') + '\nE\n');
        });
    });
})();
