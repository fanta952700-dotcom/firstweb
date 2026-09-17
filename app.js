/* =========================================================
   基础配置
========================================================= */

const CSV_PATH = "./data/关键词数据.csv";

let rawData = [];
let filteredData = [];

let sortField = "预估搜索人气";
let sortDirection = "desc";

let trendChart;
let rankingChart;
let opportunityChart;


/* =========================================================
   页面启动
========================================================= */

document.addEventListener("DOMContentLoaded", async () => {

    initCharts();

    bindEvents();

    await loadCSV();

});


/* =========================================================
   CSV 加载
========================================================= */

async function loadCSV() {

    showLoading(true);

    try {

        const response = await fetch(
            `${CSV_PATH}?t=${Date.now()}`
        );

        if (!response.ok) {

            throw new Error(
                `CSV读取失败：HTTP ${response.status}`
            );

        }

        /*
         * 不再直接使用 response.text()
         *
         * 先读取原始二进制，
         * 然后自动判断 UTF-8 / GBK / GB18030。
         */

        const buffer = await response.arrayBuffer();

        const text = decodeCSVBuffer(buffer);

        rawData = parseCSV(text);

        console.log(
            "CSV读取记录数：",
            rawData.length
        );

        console.log(
            "CSV识别到的字段：",
            rawData.length
                ? Object.keys(rawData[0])
                : []
        );

        if (!rawData.length) {

            throw new Error(
                "CSV中没有读取到有效数据。"
            );

        }


        /*
         * 检查最关键的字段有没有正确识别
         */

        const headers =
            Object.keys(rawData[0]);

        const requiredHeaders = [
            "日期",
            "核心关键词",
            "相关搜索词",
            "预估搜索人气"
        ];

        const missingHeaders =
            requiredHeaders.filter(
                header =>
                    !headers.includes(header)
            );


        if (missingHeaders.length) {

            throw new Error(
                "CSV字段识别异常。\n\n" +
                "缺少字段：" +
                missingHeaders.join("、") +
                "\n\n实际识别字段：\n" +
                headers.join(" | ")
            );

        }


        normalizeData();

        initKeywordSelect();

        updateLatestDate();

        applyFilters();

    } catch (error) {

        console.error(error);

        showError(
            "CSV 数据读取异常。\n\n" +
            error.message
        );

    } finally {

        showLoading(false);

    }

}

/* =========================================================
   CSV 编码自动识别
   支持 UTF-8 / GBK / GB18030
========================================================= */

function decodeCSVBuffer(buffer) {

    /*
     * 优先尝试严格 UTF-8
     */

    try {

        const utf8Decoder =
            new TextDecoder(
                "utf-8",
                {
                    fatal: true
                }
            );

        const text =
            utf8Decoder.decode(buffer);

        console.log(
            "CSV编码识别：UTF-8"
        );

        return text;

    } catch (error) {

        console.log(
            "UTF-8解析失败，尝试GB18030/GBK"
        );

    }


    /*
     * GB18030兼容：
     * GBK
     * GB2312
     * ANSI中文CSV
     */

    try {

        const gbDecoder =
            new TextDecoder(
                "gb18030"
            );

        const text =
            gbDecoder.decode(buffer);

        console.log(
            "CSV编码识别：GBK / GB18030"
        );

        return text;

    } catch (error) {

        console.error(
            "GB18030解析失败",
            error
        );

    }


    /*
     * 最后兜底
     */

    return new TextDecoder(
        "utf-8"
    ).decode(buffer);

}

/* =========================================================
   CSV 解析器
   支持：
   - 中文
   - 双引号
   - 字段中存在逗号
========================================================= */

function parseCSV(text) {

    /*
     * 去除：
     * UTF-8 BOM
     * 零宽字符
     */

    text = text
        .replace(/^\uFEFF/, "")
        .replace(
            /[\u200B-\u200D\u2060]/g,
            ""
        );


    const rows = [];

    let row = [];
    let cell = "";
    let insideQuotes = false;


    for (
        let i = 0;
        i < text.length;
        i++
    ) {

        const char =
            text[i];

        const nextChar =
            text[i + 1];


        /*
         * CSV中的 ""
         */

        if (
            char === '"' &&
            insideQuotes &&
            nextChar === '"'
        ) {

            cell += '"';

            i++;

        }

        /*
         * 引号开始/结束
         */

        else if (
            char === '"'
        ) {

            insideQuotes =
                !insideQuotes;

        }

        /*
         * 逗号
         */

        else if (
            char === "," &&
            !insideQuotes
        ) {

            row.push(
                cell.trim()
            );

            cell = "";

        }

        /*
         * 换行
         */

        else if (
            (
                char === "\n" ||
                char === "\r"
            ) &&
            !insideQuotes
        ) {

            if (
                char === "\r" &&
                nextChar === "\n"
            ) {

                i++;

            }


            row.push(
                cell.trim()
            );


            if (
                row.some(
                    item =>
                        item !== ""
                )
            ) {

                rows.push(row);

            }


            row = [];

            cell = "";

        }

        else {

            cell += char;

        }

    }


    /*
     * 最后一行
     */

    if (
        cell.length ||
        row.length
    ) {

        row.push(
            cell.trim()
        );

        rows.push(row);

    }


    if (
        rows.length < 2
    ) {

        return [];

    }


    /*
     * 清理表头
     */

    const headers =
        rows[0].map(
            header =>
                String(header)
                    .replace(
                        /^\uFEFF/,
                        ""
                    )
                    .replace(
                        /[\u200B-\u200D\u2060]/g,
                        ""
                    )
                    .trim()
        );


    console.log(
        "CSV原始表头：",
        headers
    );


    return rows
        .slice(1)

        .filter(
            row =>
                row.some(
                    cell =>
                        String(
                            cell
                        ).trim() !== ""
                )
        )

        .map(row => {

            const obj = {};


            headers.forEach(
                (
                    header,
                    index
                ) => {

                    obj[header] =
                        row[index] !==
                        undefined

                        ? row[index].trim()

                        : "";

                }
            );


            return obj;

        });

}


/* =========================================================
   数据标准化
========================================================= */

function normalizeData() {

    rawData = rawData.map(item => {

        return {

            ...item,

            日期对象:
                parseDate(item["日期"]),

            点击率数值:
                toRate(item["点击率"]),

            搜索人气环比数值:
                toRate(item["搜索人气环比"]),

            点击率环比数值:
                toRate(item["点击率环比"]),

            支付转化率环比数值:
                toRate(item["支付转化率环比"]),

            支付买家数环比数值:
                toRate(item["支付买家数环比"]),

            需求供给比环比数值:
                toRate(item["需求供给比环比"]),

            需求供给比数值:
                toNumber(item["需求供给比"]),

            预估搜索人气数值:
                toNumber(item["预估搜索人气"]),

            预估点击人数数值:
                toNumber(item["预估点击人数"]),

            预估支付转化率数值:
                toRate(item["预估支付转化率"]),

            预估购买人数数值:
                toNumber(item["预估购买人数"])

        };

    });

}


/* =========================================================
   日期解析
========================================================= */

function parseDate(value) {

    if (!value) return null;

    const clean = String(value).trim();

    const parts = clean
        .replace(/-/g, "/")
        .split("/");

    if (parts.length !== 3) return null;

    return new Date(
        Number(parts[0]),
        Number(parts[1]) - 1,
        Number(parts[2])
    );

}


/* =========================================================
   数值工具
========================================================= */

function toNumber(value) {

    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {

        return 0;

    }

    let str = String(value)
        .replace(/,/g, "")
        .trim();

    /*
     * 如果是区间，例如：
     * 100 ~ 250
     * 自动取中间值。
     */

    if (
        str.includes("~") ||
        str.includes("～")
    ) {

        const arr = str
            .split(/[~～]/)
            .map(v =>
                parseFloat(
                    v.replace("%", "")
                )
            )
            .filter(v => !isNaN(v));

        if (arr.length === 2) {

            return (
                arr[0] + arr[1]
            ) / 2;

        }

    }

    const number = parseFloat(
        str.replace("%", "")
    );

    return isNaN(number)
        ? 0
        : number;

}


function toRate(value) {

    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {

        return 0;

    }

    const str = String(value).trim();

    /*
     * 如果是：
     * 15%~20%
     */

    if (
        str.includes("~") ||
        str.includes("～")
    ) {

        const value =
            toNumber(str);

        return value / 100;

    }

    /*
     * 17.5%
     */

    if (str.includes("%")) {

        return (
            parseFloat(
                str.replace("%", "")
            ) / 100
        );

    }

    /*
     * CSV 本身是 0.175
     */

    const number = parseFloat(str);

    return isNaN(number)
        ? 0
        : number;

}


/* =========================================================
   初始化关键词
========================================================= */

function initKeywordSelect() {

    const select =
        document.getElementById(
            "keywordSelect"
        );

    const keywords =
        [...new Set(
            rawData
                .map(item =>
                    item["核心关键词"]
                )
                .filter(Boolean)
        )]
        .sort();

    select.innerHTML =
        `<option value="全部">全部</option>`;

    keywords.forEach(keyword => {

        const option =
            document.createElement(
                "option"
            );

        option.value = keyword;
        option.textContent = keyword;

        select.appendChild(option);

    });

}


/* =========================================================
   最新日期
========================================================= */

function getLatestDate() {

    const dates =
        rawData
            .map(item =>
                item.日期对象
            )
            .filter(Boolean);

    if (!dates.length) {

        return null;

    }

    return new Date(
        Math.max(
            ...dates.map(
                date =>
                    date.getTime()
            )
        )
    );

}


function updateLatestDate() {

    const latest =
        getLatestDate();

    document.getElementById(
        "latestDate"
    ).textContent =
        latest
            ? formatDate(latest)
            : "-";

}


/* =========================================================
   筛选
========================================================= */

function applyFilters() {

    const keyword =
        document.getElementById(
            "keywordSelect"
        ).value;

    const range =
        document.getElementById(
            "dateRange"
        ).value;

    const search =
        document.getElementById(
            "searchInput"
        )
        .value
        .trim()
        .toLowerCase();

    const latestDate =
        getLatestDate();

    filteredData =
        rawData.filter(item => {

            /* 核心关键词 */

            if (
                keyword !== "全部" &&
                item["核心关键词"] !== keyword
            ) {

                return false;

            }


            /* 搜索 */

            if (
                search &&
                !String(
                    item["相关搜索词"] || ""
                )
                .toLowerCase()
                .includes(search)
            ) {

                return false;

            }


            /* 日期 */

            if (
                latestDate &&
                item.日期对象
            ) {

                if (range === "latest") {

                    return sameDay(
                        item.日期对象,
                        latestDate
                    );

                }

                if (
                    range === "7" ||
                    range === "30"
                ) {

                    const days =
                        Number(range);

                    const start =
                        new Date(
                            latestDate
                        );

                    start.setDate(
                        start.getDate() -
                        (days - 1)
                    );

                    if (
                        item.日期对象 < start ||
                        item.日期对象 > latestDate
                    ) {

                        return false;

                    }

                }

            }

            return true;

        });


    renderDashboard();

}


/* =========================================================
   Dashboard
========================================================= */

function renderDashboard() {

    renderKPI();

    renderTrendChart();

    renderRankingChart();

    renderOpportunityChart();

    renderOpportunityList();

    renderTable();

}


/* =========================================================
   KPI
========================================================= */

function renderKPI() {

    /*
     * 搜索词去重
     */

    const uniqueKeywords =
        new Set(
            filteredData.map(
                item =>
                    item["相关搜索词"]
            )
        );


    /*
     * 当选择了多天时：
     * 直接 SUM 会重复累计同一词。
     *
     * 第一版这里采用所有记录统计。
     * 后续我们可以改成：
     * - 最新值
     * - 日均值
     * - 周均值
     */

    const searchPopularity =
        sum(
            filteredData,
            "预估搜索人气数值"
        );

    const clicks =
        sum(
            filteredData,
            "预估点击人数数值"
        );

    const buyers =
        sum(
            filteredData,
            "预估购买人数数值"
        );

    const clickRate =
        average(
            filteredData,
            "点击率数值"
        );

    const conversionRate =
        average(
            filteredData,
            "预估支付转化率数值"
        );


    setText(
        "kpiKeywordCount",
        formatNumber(
            uniqueKeywords.size
        )
    );

    setText(
        "kpiSearchPopularity",
        formatNumber(
            searchPopularity
        )
    );

    setText(
        "kpiClickRate",
        formatPercent(
            clickRate
        )
    );

    setText(
        "kpiConversionRate",
        formatPercent(
            conversionRate
        )
    );

    setText(
        "kpiClicks",
        formatNumber(
            clicks
        )
    );

    setText(
        "kpiBuyers",
        formatNumber(
            buyers
        )
    );

}


/* =========================================================
   趋势图
========================================================= */

function renderTrendChart() {

    const map = {};

    filteredData.forEach(item => {

        const date =
            item["日期"];

        if (!date) return;

        if (!map[date]) {

            map[date] = 0;

        }

        map[date] +=
            item.预估搜索人气数值;

    });


    const records =
        Object.entries(map)
            .map(
                ([date, value]) => ({
                    date,
                    dateObject:
                        parseDate(date),
                    value
                })
            )
            .sort(
                (a, b) =>
                    a.dateObject -
                    b.dateObject
            );


    const dates =
        records.map(
            item =>
                formatShortDate(
                    item.dateObject
                )
        );

    const values =
        records.map(
            item =>
                item.value
        );


    trendChart.setOption({

        tooltip: {
            trigger: "axis"
        },

        grid: {
            top: 30,
            left: 60,
            right: 25,
            bottom: 45
        },

        xAxis: {

            type: "category",

            boundaryGap: false,

            data: dates,

            axisLine: {
                lineStyle: {
                    color: "#d1d5db"
                }
            }

        },

        yAxis: {

            type: "value",

            splitLine: {
                lineStyle: {
                    color: "#f1f3f5"
                }
            }

        },

        series: [

            {

                name:
                    "预估搜索人气",

                type:
                    "line",

                smooth:
                    true,

                showSymbol:
                    false,

                areaStyle: {
                    opacity: 0.06
                },

                data:
                    values

            }

        ]

    });

}


/* =========================================================
   TOP10
========================================================= */

function renderRankingChart() {

    /*
     * 如果包含多天数据：
     * 同搜索词进行累计。
     */

    const map = {};

    filteredData.forEach(item => {

        const name =
            item["相关搜索词"];

        if (!name) return;

        if (!map[name]) {

            map[name] = 0;

        }

        map[name] +=
            item.预估搜索人气数值;

    });


    const records =
        Object.entries(map)
            .map(
                ([name, value]) => ({
                    name,
                    value
                })
            )
            .sort(
                (a, b) =>
                    b.value - a.value
            )
            .slice(0, 10)
            .reverse();


    rankingChart.setOption({

        tooltip: {
            trigger: "axis",
            axisPointer: {
                type: "shadow"
            }
        },

        grid: {
            top: 15,
            left: 130,
            right: 30,
            bottom: 30
        },

        xAxis: {

            type: "value",

            splitLine: {
                lineStyle: {
                    color: "#f1f3f5"
                }
            }

        },

        yAxis: {

            type: "category",

            data:
                records.map(
                    item =>
                        item.name
                ),

            axisLabel: {

                formatter: function(value) {

                    if (
                        value.length > 10
                    ) {

                        return (
                            value.substring(
                                0,
                                10
                            ) +
                            "…"
                        );

                    }

                    return value;

                }

            }

        },

        series: [

            {

                type: "bar",

                barWidth: 12,

                data:
                    records.map(
                        item =>
                            item.value
                    ),

                itemStyle: {
                    borderRadius: [
                        0,
                        4,
                        4,
                        0
                    ]
                }

            }

        ]

    });

}


/* =========================================================
   机会矩阵
========================================================= */

function renderOpportunityChart() {

    /*
     * 避免多天出现大量重复点：
     * 默认每个相关搜索词使用最新一条。
     */

    const latestMap = {};

    filteredData
        .slice()
        .sort(
            (a, b) =>
                a.日期对象 -
                b.日期对象
        )
        .forEach(item => {

            latestMap[
                item["相关搜索词"]
            ] = item;

        });


    const data =
        Object.values(latestMap)
            .filter(
                item =>
                    item.预估搜索人气数值 >
                    0
            )
            .map(item => {

                return {

                    name:
                        item["相关搜索词"],

                    value: [

                        item.预估搜索人气数值,

                        item.预估支付转化率数值 *
                        100,

                        item.预估购买人数数值

                    ]

                };

            });


    opportunityChart.setOption({

        tooltip: {

            formatter: function(params) {

                const data =
                    params.data;

                return `
                    <b>${data.name}</b><br>
                    搜索人气：
                    ${formatNumber(data.value[0])}
                    <br>
                    支付转化率：
                    ${data.value[1].toFixed(1)}%
                    <br>
                    预估购买人数：
                    ${formatNumber(data.value[2])}
                `;

            }

        },

        grid: {
            top: 25,
            left: 65,
            right: 30,
            bottom: 55
        },

        xAxis: {

            type: "value",

            name:
                "搜索人气",

            nameLocation:
                "middle",

            nameGap:
                32,

            splitLine: {
                lineStyle: {
                    color:
                        "#f1f3f5"
                }
            }

        },

        yAxis: {

            type: "value",

            name:
                "支付转化率 %",

            splitLine: {
                lineStyle: {
                    color:
                        "#f1f3f5"
                }
            }

        },

        series: [

            {

                type:
                    "scatter",

                data,

                symbolSize:
                    function(value) {

                        const buyers =
                            value[2];

                        return Math.max(
                            8,
                            Math.min(
                                32,
                                Math.sqrt(
                                    buyers
                                ) * 1.3
                            )
                        );

                    }

            }

        ]

    });

}


/* =========================================================
   供需机会榜
========================================================= */

function renderOpportunityList() {

    const container =
        document.getElementById(
            "opportunityList"
        );

    const latestMap = {};

    filteredData
        .slice()
        .sort(
            (a, b) =>
                a.日期对象 -
                b.日期对象
        )
        .forEach(item => {

            latestMap[
                item["相关搜索词"]
            ] = item;

        });


    const records =
        Object.values(latestMap)
            .sort(
                (a, b) =>
                    b.需求供给比数值 -
                    a.需求供给比数值
            )
            .slice(0, 10);


    container.innerHTML = "";


    if (!records.length) {

        container.innerHTML =
            `<div style="padding:30px;color:#9ca3af;text-align:center;">
                暂无数据
            </div>`;

        return;

    }


    records.forEach(
        (item, index) => {

            const div =
                document.createElement(
                    "div"
                );

            div.className =
                "rank-item";

            div.innerHTML = `

                <div class="rank-number">
                    ${String(
                        index + 1
                    ).padStart(
                        2,
                        "0"
                    )}
                </div>

                <div
                    class="rank-name"
                    title="${escapeHTML(
                        item["相关搜索词"]
                    )}"
                >
                    ${escapeHTML(
                        item["相关搜索词"]
                    )}
                </div>

                <div class="rank-value">
                    ${item.需求供给比数值.toFixed(3)}
                </div>

            `;

            container.appendChild(
                div
            );

        }
    );

}


/* =========================================================
   表格
========================================================= */

function renderTable() {

    const tbody =
        document.getElementById(
            "dataTableBody"
        );

    const data =
        [...filteredData];


    data.sort(
        (a, b) => {

            let va =
                getSortValue(
                    a,
                    sortField
                );

            let vb =
                getSortValue(
                    b,
                    sortField
                );

            if (
                typeof va === "number" &&
                typeof vb === "number"
            ) {

                return sortDirection ===
                    "asc"

                    ? va - vb
                    : vb - va;

            }

            return sortDirection ===
                "asc"

                ? String(va)
                    .localeCompare(
                        String(vb),
                        "zh-CN"
                    )

                : String(vb)
                    .localeCompare(
                        String(va),
                        "zh-CN"
                    );

        }
    );


    tbody.innerHTML = "";


    /*
     * 第一版最多渲染1000行，
     * 避免超大 CSV 卡顿。
     */

    const displayData =
        data.slice(
            0,
            1000
        );


    displayData.forEach(item => {

        const tr =
            document.createElement(
                "tr"
            );


        tr.innerHTML = `

            <td>
                ${escapeHTML(
                    item["日期"]
                )}
            </td>

            <td>
                ${escapeHTML(
                    item["核心关键词"]
                )}
            </td>

            <td>
                <b>
                    ${escapeHTML(
                        item["相关搜索词"]
                    )}
                </b>
            </td>

            <td>
                ${formatNumber(
                    item.预估搜索人气数值
                )}
            </td>

            <td>
                ${formatPercent(
                    item.点击率数值
                )}
            </td>

            <td>
                ${formatPercent(
                    item.预估支付转化率数值
                )}
            </td>

            <td>
                ${formatNumber(
                    item.预估购买人数数值
                )}
            </td>

            <td>
                ${item.需求供给比数值.toFixed(
                    3
                )}
            </td>

            <td class="${
                item.搜索人气环比数值 >=
                0
                    ? "positive"
                    : "negative"
            }">

                ${
                    item.搜索人气环比数值 >
                    0
                        ? "+"
                        : ""
                }

                ${formatPercent(
                    item.搜索人气环比数值
                )}

            </td>

        `;


        tbody.appendChild(
            tr
        );

    });


    document.getElementById(
        "tableCount"
    ).textContent =
        `共 ${formatNumber(
            data.length
        )} 条记录${
            data.length >
            1000

            ? "，当前展示前1000条"
            : ""
        }`;

}


/* =========================================================
   排序值映射
========================================================= */

function getSortValue(
    item,
    field
) {

    const map = {

        "预估搜索人气":
            "预估搜索人气数值",

        "点击率":
            "点击率数值",

        "预估支付转化率":
            "预估支付转化率数值",

        "预估购买人数":
            "预估购买人数数值",

        "需求供给比":
            "需求供给比数值",

        "搜索人气环比":
            "搜索人气环比数值"

    };


    if (
        field === "日期"
    ) {

        return item.日期对象
            ? item.日期对象.getTime()
            : 0;

    }


    return (
        item[
            map[field] ||
            field
        ] ?? ""
    );

}


/* =========================================================
   图表初始化
========================================================= */

function initCharts() {

    trendChart =
        echarts.init(
            document.getElementById(
                "trendChart"
            )
        );

    rankingChart =
        echarts.init(
            document.getElementById(
                "rankingChart"
            )
        );

    opportunityChart =
        echarts.init(
            document.getElementById(
                "opportunityChart"
            )
        );


    window.addEventListener(
        "resize",
        () => {

            trendChart.resize();
            rankingChart.resize();
            opportunityChart.resize();

        }
    );

}


/* =========================================================
   事件
========================================================= */

function bindEvents() {

    document
        .getElementById(
            "keywordSelect"
        )
        .addEventListener(
            "change",
            applyFilters
        );


    document
        .getElementById(
            "dateRange"
        )
        .addEventListener(
            "change",
            applyFilters
        );


    document
        .getElementById(
            "searchInput"
        )
        .addEventListener(
            "input",
            applyFilters
        );


    document
        .getElementById(
            "resetBtn"
        )
        .addEventListener(
            "click",
            () => {

                document
                    .getElementById(
                        "keywordSelect"
                    )
                    .value =
                    "全部";

                document
                    .getElementById(
                        "dateRange"
                    )
                    .value =
                    "latest";

                document
                    .getElementById(
                        "searchInput"
                    )
                    .value =
                    "";

                applyFilters();

            }
        );


    document
        .querySelectorAll(
            "th[data-sort]"
        )
        .forEach(th => {

            th.addEventListener(
                "click",
                () => {

                    const field =
                        th.dataset.sort;

                    if (
                        sortField === field
                    ) {

                        sortDirection =
                            sortDirection ===
                            "asc"

                            ? "desc"
                            : "asc";

                    } else {

                        sortField =
                            field;

                        sortDirection =
                            "desc";

                    }

                    renderTable();

                }
            );

        });

}


/* =========================================================
   通用函数
========================================================= */

function sum(
    data,
    field
) {

    return data.reduce(
        (total, item) =>
            total +
            (
                Number(
                    item[field]
                ) || 0
            ),
        0
    );

}


function average(
    data,
    field
) {

    const values =
        data
            .map(
                item =>
                    Number(
                        item[field]
                    )
            )
            .filter(
                value =>
                    !isNaN(value)
            );

    if (!values.length) {

        return 0;

    }

    return (
        values.reduce(
            (a, b) =>
                a + b,
            0
        ) /
        values.length
    );

}


function formatNumber(value) {

    if (
        value === null ||
        value === undefined ||
        isNaN(value)
    ) {

        return "-";

    }

    return new Intl.NumberFormat(
        "zh-CN",
        {
            maximumFractionDigits: 1
        }
    ).format(value);

}


function formatPercent(value) {

    if (
        value === null ||
        value === undefined ||
        isNaN(value)
    ) {

        return "-";

    }

    return (
        value * 100
    ).toFixed(1) + "%";

}


function formatDate(date) {

    if (!date) return "-";

    const y =
        date.getFullYear();

    const m =
        String(
            date.getMonth() + 1
        ).padStart(
            2,
            "0"
        );

    const d =
        String(
            date.getDate()
        ).padStart(
            2,
            "0"
        );

    return `${y}-${m}-${d}`;

}


function formatShortDate(date) {

    if (!date) return "";

    return `${
        date.getMonth() + 1
    }/${date.getDate()}`;

}


function sameDay(
    a,
    b
) {

    return (
        a.getFullYear() ===
        b.getFullYear() &&

        a.getMonth() ===
        b.getMonth() &&

        a.getDate() ===
        b.getDate()
    );

}


function setText(
    id,
    value
) {

    const el =
        document.getElementById(
            id
        );

    if (el) {

        el.textContent =
            value;

    }

}


function showLoading(show) {

    document.getElementById(
        "loading"
    ).style.display =
        show
            ? "flex"
            : "none";

}


function showError(message) {

    const box =
        document.getElementById(
            "errorBox"
        );

    box.textContent =
        message;

    box.style.display =
        "block";

}


function escapeHTML(value) {

    return String(
        value ?? ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}