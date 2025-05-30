/**
 * FeHelper Full Page Capture
 * @type {{scroll}}
 */
window.screenshotContentScript = function () {

    let screenshots = [];
    let capturedData = {};
    let MAX_PRIMARY_DIMENSION = 50000 * 2,
        MAX_SECONDARY_DIMENSION = 20000 * 2,
        MAX_AREA = MAX_PRIMARY_DIMENSION * MAX_SECONDARY_DIMENSION;
        let pageOriginalTitle = document.title;

    /**
     * URL合法性校验
     * @param url
     * @returns {boolean}
     */
    function isValidUrl(url) {

        let matches = ['http://*/*', 'https://*/*', 'ftp://*/*', 'file://*/*'],
            noMatches = [/^https?:\/\/chrome.google.com\/.*$/];

        let r, i;
        for (i = noMatches.length - 1; i >= 0; i--) {
            if (noMatches[i].test(url)) {
                return false;
            }
        }
        for (i = matches.length - 1; i >= 0; i--) {
            r = new RegExp('^' + matches[i].replace(/\*/g, '.*') + '$');
            if (r.test(url)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 如果页面超级超级长，需要拆分成多张图片来存储
     * @param totalWidth
     * @param totalHeight
     * @returns {Array}
     * @private
     */
    function _initScreenshots(totalWidth, totalHeight) {
        let badSize = (totalHeight > MAX_PRIMARY_DIMENSION ||
            totalWidth > MAX_PRIMARY_DIMENSION ||
            totalHeight * totalWidth > MAX_AREA),
            biggerWidth = totalWidth > totalHeight,
            maxWidth = (!badSize ? totalWidth :
                (biggerWidth ? MAX_PRIMARY_DIMENSION : MAX_SECONDARY_DIMENSION)),
            maxHeight = (!badSize ? totalHeight :
                (biggerWidth ? MAX_SECONDARY_DIMENSION : MAX_PRIMARY_DIMENSION)),
            numCols = Math.ceil(totalWidth / maxWidth),
            numRows = Math.ceil(totalHeight / maxHeight),
            row, col, canvas, left, top;

        let canvasIndex = 0;
        let result = [];

        for (row = 0; row < numRows; row++) {
            for (col = 0; col < numCols; col++) {
                canvas = document.createElement('canvas');
                canvas.width = (col === numCols - 1 ? totalWidth % maxWidth || maxWidth : maxWidth);
                canvas.height = (row === numRows - 1 ? totalHeight % maxHeight || maxHeight : maxHeight);

                left = col * maxWidth;
                top = row * maxHeight;

                result.push({
                    canvas: canvas,
                    ctx: canvas.getContext('2d'),
                    index: canvasIndex,
                    left: left,
                    right: left + canvas.width,
                    top: top,
                    bottom: top + canvas.height
                });

                canvasIndex++;
            }
        }

        return result;
    }


    /**
     * 从截屏中筛选有效数据
     * @param imgLeft
     * @param imgTop
     * @param imgWidth
     * @param imgHeight
     * @param screenshots
     * @private
     */
    function _filterScreenshots(imgLeft, imgTop, imgWidth, imgHeight, screenshots) {
        // Filter down the screenshots to ones that match the location
        // of the given image.
        let imgRight = imgLeft + imgWidth,
            imgBottom = imgTop + imgHeight;
        return screenshots.filter(function (screenshot) {
            return (imgLeft < screenshot.right &&
                imgRight > screenshot.left &&
                imgTop < screenshot.bottom &&
                imgBottom > screenshot.top);
        });
    }


    let addScreenShot = function (data, uri) {
        let image = new Image();

        image.onload = function () {
            data.image = {width: image.width, height: image.height};

            // given device mode emulation or zooming, we may end up with
            // a different sized image than expected, so let's adjust to
            // match it!
            if (data.windowWidth !== image.width) {
                let scale = image.width / data.windowWidth;
                data.x *= scale;
                data.y *= scale;
                data.totalWidth *= scale;
                data.totalHeight *= scale;
            }

            // lazy initialization of screenshot canvases (since we need to wait
            // for actual image size)
            if (!screenshots.length) {
                Array.prototype.push.apply(
                    screenshots,
                    _initScreenshots(data.totalWidth, data.totalHeight)
                );
            }

            // draw it on matching screenshot canvases
            _filterScreenshots(
                data.x, data.y, image.width, image.height, screenshots
            ).forEach(function (screenshot) {
                screenshot.ctx.drawImage(
                    image,
                    data.x - screenshot.left,
                    data.y - screenshot.top
                );
            });

            if (data.complete === 1) {
                captureConfig.success(data);
            }
        };
        image.src = uri;
    };


    /**
     * 通过网页url生成默认的文件名
     * @param contentURL
     * @returns {string}
     */
    function buildFilenameFromUrl() {
        let name = location.href.split('?')[0].split('#')[0];
        if (name) {
            name = name
                .replace(/^https?:\/\//, '')
                .replace(/[^A-z0-9]+/g, '-')
                .replace(/-+/g, '-')
                .replace(/^[_\-]+/, '')
                .replace(/[_\-]+$/, '');
            name = '-' + name;
        } else {
            name = '';
        }
        return 'fehelper' + name + '-' + Date.now() + '.png';
    }


    // 配置项
    let captureConfig = {
        // 获取原始数据，用这个
        success: function (data) {
            chrome.runtime.sendMessage({
                type: 'fh-dynamic-any-thing',
                thing: 'page-screenshot-done',
                params: {
                    filename: buildFilenameFromUrl(),
                    screenshots: screenshots.map(ss => {
                        ss.dataUri=ss.canvas.toDataURL()
                        return ss;
                    }),
                    totalWidth: data.totalWidth,
                    totalHeight: data.totalHeight
                }
            });
        },

        fail: reason => {
            alert(reason && reason.message || reason || '稍后尝试刷新页面重试!');
        },

        progress: complete => {
            let percent = parseInt(complete * 100, 10) + '%';
            document.title = `进度：${percent}...`;

            if (percent === '100%') {
                setTimeout(() => {
                    document.title = pageOriginalTitle;
                }, 800);
            }

            return true;
        }
    };


    function max(nums) {
        return Math.max.apply(Math, nums.filter(function (x) {
            return x;
        }));
    }

    function goCapture(params) {

        if (!isValidUrl(location.href)) {
            return captureConfig.fail('invalid url');
        }

        let body = document.body,
            originalBodyOverflowYStyle = body ? body.style.overflowY : '',
            originalX = window.scrollX,
            originalY = window.scrollY,
            originalOverflowStyle = document.documentElement.style.overflow;

        if (body) {
            body.style.overflowY = 'visible';
        }

        let widths = [
                document.documentElement.clientWidth,
                body ? body.scrollWidth : 0,
                document.documentElement.scrollWidth,
                body ? body.offsetWidth : 0,
                document.documentElement.offsetWidth
            ],
            heights = [
                document.documentElement.clientHeight,
                body ? body.scrollHeight : 0,
                document.documentElement.scrollHeight,
                body ? body.offsetHeight : 0,
                document.documentElement.offsetHeight
            ],
            fullWidth = max(widths),
            fullHeight = max(heights),
            windowWidth = window.innerWidth,
            windowHeight = window.innerHeight,
            arrangements = [],
            scrollPad = 200,
            yDelta = windowHeight - (windowHeight > scrollPad ? scrollPad : 0),
            xDelta = windowWidth,
            yPos = fullHeight - windowHeight,
            xPos,
            numArrangements,
            captureVisible = false;

        // During zooming, there can be weird off-by-1 types of things...
        if (fullWidth <= xDelta + 1) {
            fullWidth = xDelta;
        }

        // Disable all scrollbars. We'll restore the scrollbar state when we're done
        // taking the screenshots.
        document.documentElement.style.overflow = 'hidden';

        // 截图：可视区域
        if (params.captureType === 'visible') {
            arrangements = [window.scrollX, window.scrollY];
            fullWidth = window.innerWidth;
            fullHeight = window.innerHeight;
            captureVisible = true;
        } else {
            // 全网页截图
            while (yPos > -yDelta) {
                xPos = 0;
                while (xPos < fullWidth) {
                    arrangements.push([xPos, yPos]);
                    xPos += xDelta;
                }
                yPos -= yDelta;
            }
        }

        numArrangements = arrangements.length;

        function cleanUp() {
            document.documentElement.style.overflow = originalOverflowStyle;
            if (body) {
                body.style.overflowY = originalBodyOverflowYStyle;
            }
            window.scrollTo(originalX, originalY);
        }

        (function processArrangements() {
            if (!arrangements.length) {
                return cleanUp();
            }

            let next = arrangements.pop(),
                x = next[0], y = next[1];

            let complete = 1;
            let dataX = 0;
            let dataY = 0;
            if (!captureVisible) {
                window.scrollTo(x, y);
                complete = (numArrangements - arrangements.length) / numArrangements;
                dataX = window.scrollX;
                dataY = window.scrollY;
            }

            let data = {
                x: dataX,
                y: dataY,
                complete: complete,
                windowWidth: windowWidth,
                totalWidth: fullWidth,
                totalHeight: fullHeight,
                devicePixelRatio: window.devicePixelRatio,
                tabId: window.__FH_TAB_ID__
            };

            // Need to wait for things to settle
            window.setTimeout(function () {
                // In case the below callback never returns, cleanup
                let cleanUpTimeout = window.setTimeout(cleanUp, 1250);

                captureConfig.progress(data.complete);

                chrome.runtime.sendMessage({
                    type: 'fh-dynamic-any-thing',
                    thing: 'add-screen-shot-by-pages',
                    params: data
                }).then(resp => {
                    if(resp.uri) {
                        addScreenShot(resp.params,resp.uri);
                    }
                    window.clearTimeout(cleanUpTimeout);
                    if (data.complete !== 1) {
                        setTimeout(processArrangements,200);
                    } else {
                        cleanUp();
                    }
                });
            }, 150);
        })();
    }

    window.screenshotNoPage = function(){
        let elWrapper = document.createElement('div');
        elWrapper.innerHTML = '<div id="fehelper_screenshot" style="position:fixed;left:0;top:0;right:0;z-index:1000000;padding:15px;background:#000;text-align:center;">' +
            '<button id="btnVisible" style="margin: 0 10px;padding: 10px;border-radius: 5px;border: 1px solid #fff;cursor:pointer;">可视区域截图</button>' +
            '<button id="btnWhole" style="margin: 0 10px;padding: 10px;border-radius: 5px;border: 1px solid #fff;cursor:pointer;">全网页截图</button></div>';
        elAlertMsg = elWrapper.childNodes[0];
        document.body.appendChild(elAlertMsg);
        document.querySelector('#btnVisible').onclick = e => {
            elAlertMsg.remove();
            goCapture({captureType:'visible'});
        };
        document.querySelector('#btnWhole').onclick = e => {
            elAlertMsg.remove();
            goCapture({captureType:'whole'});
        };
    };
};
