dojo.provide("PivotDataWidget.widget.PivotDataWidget");

dojo.declare('PivotDataWidget.widget.PivotDataWidget', [ mxui.widget._WidgetBase, mxui.mixin._Contextable ], {

    widgetContext                   : null,
    contextGUID                     : null,
    getDataMicroflowCallPending     : null,
    handle                          : null,
    mendixObjectArray               : null,
    cellMap                         : {},
    xKeyArray                       : [],
    yKeyArray                       : [],
    entityMetaData                  : null,
    progressDialogId                : null,
    cellValueAttrType               : null,
    validActionAttrTypeCombinations : [
        "sum_Currency",
        "sum_Float",
        "sum_Integer",
        "sum_Long",
        "average_Currency",
        "average_Float",
        "average_Integer",
        "average_Long",
        "min_Currency",
        "min_DateTime",
        "min_Float",
        "min_Integer",
        "min_Long",
        "max_Currency",
        "max_DateTime",
        "max_Float",
        "max_Integer",
        "max_Long"
    ],
    onClickXIdValue                 : null,
    onClickYIdValue                 : null,
    onClickMendixObject             : null,
    onCellClickReferenceName        : null,

    /**
     * Called by the Mendix runtime after creation.
     */
    postCreate: function () {
        'use strict';
        dojo.addClass(this.domNode, "PivotDataWidget");

        // Load CSS ... automatically from ui directory

        if (this.onCellClickReference) {
            this.onCellClickReferenceName = this.onCellClickReference.substr(0, this.onCellClickReference.indexOf('/'));
        }
    },

    /**
     * Called by the Mendix runtime to make the context available
     *
     * @param context       The context to use
     * @param callback      The callback to call when done accepting the context, may be null
     */
    applyContext: function (context, callback) {
        'use strict';
        var
            thisObj = this;

        console.log(this.domNode.id + ": applyContext");

        if (this.handle) {
            mx.data.unsubscribe(this.handle);
        }

        if (context) {
            this.widgetContext = context;
            this.contextGUID = context.getTrackID();
            console.log(this.domNode.id + ": applyContext, context object GUID: " + this.contextGUID);
            if (this.checkProperties()) {
                if (this.callGetDataMicroflow === "crtOnly" || this.callGetDataMicroflow === "crtAndChg") {
                    thisObj.getData();
                }
                if (this.callGetDataMicroflow === "crtAndChg" || this.callGetDataMicroflow === "chgOnly") {
                    this.handle = mx.data.subscribe({
                        guid: this.contextGUID,
                        callback: dojo.hitch(this, this.contextObjectChangedCallback)
                    });
                }
            }
        } else {
            alert(this.id + ".applyContext received empty context");
        }
        if (callback) {
            callback();
        }
    },

    contextObjectChangedCallback: function () {
        'use strict';

        console.log(this.domNode.id + ": Context object has changed");
        this.getData();
    },

    /**
     * Call the microflow to get the data
     */
    getData: function () {
        'use strict';

        console.log(this.domNode.id + ": Call microflow to get the data");

        if (this.getDataMicroflowCallPending) {
            // Prevent problems when Mendix runtime calls applyContext multiple times
            // When the microflow commits the context object, we might go into an endless loop!
            console.log(this.domNode.id + ": Skipped microflow call as we did not get an answer from a previous call.");
            return;
        }
        this.getDataMicroflowCallPending = true;
        this.showProgress();

        var args = {
            params: {
                actionname: this.getDataMicroflow
            },
            context: this.widgetContext,
            callback: dojo.hitch(this, this.dataMicroflowCallback),
            error: dojo.hitch(this, this.dataMicroflowError)
        };
        mx.data.action(args);
    },

    /**
     * Called upon completion of the microflow
     *
     * @param mendixObjectArray      The list as returned from the microflow
     */
    dataMicroflowCallback: function (mendixObjectArray) {
        'use strict';

        var
            noDataNode;

        console.log(this.domNode.id + ": dataMicroflowCallback");

        this.getDataMicroflowCallPending = false;
        this.hideProgress();

        this.mendixObjectArray = mendixObjectArray;

        // Remove any old data
        dojo.empty(this.domNode);
        this.cellMap        = {};
        this.xKeyArray      = [];
        this.yKeyArray      = [];

        if (this.checkData()) {
            if (this.mendixObjectArray.length > 0) {
                this.buildTableData();
                this.createTable();
            } else {
                noDataNode = mxui.dom.p(this.noDataText);
                dojo.addClass(noDataNode, this.noDataTextClass);
                this.domNode.appendChild(noDataNode);
            }
        }

    },

    /**
     * Called when the microflow call ended with an error
     *
     * @param err       The error object, if any
     */
    dataMicroflowError: function (err) {
        'use strict';

        this.hideProgress();
        this.getDataMicroflowCallPending = false;

        console.dir(err);
        alert("Call to microflow " + this.getDataMicroflow + " ended with an error");
    },

    /**
     * Check whether the properties are set correctly.
     *
     * @returns {boolean}       True if properties are correct, false otherwise
     */
    checkProperties: function () {
        'use strict';

        console.log(this.domNode.id + ": checkProperties");

        var
            errorMessageArray = [],
            minDateValue,
            tresholdIndex;

        // Check whether total row/column is allowed
        if (this.cellValueAction !== "count" && this.cellValueAction !== "sum") {
            // Total row/column only allowed for count and sum
            if (this.showTotalColumn) {
                errorMessageArray.push("Total column is only supported for count and sum");
            }
            if (this.showTotalRow) {
                errorMessageArray.push("Total row is only supported for count and sum");
            }
        }

        if (this.cellValueAction === "average") {
            if (this.precisionForAverage < 0 || this.precisionForAverage > 10) {
                errorMessageArray.push("Decimal precision for average must be between 0 and 10");
            }
        }

        // These checks can be done only when there is no error on the microflow output
        if (errorMessageArray.length === 0) {
            this.entityMetaData = mx.meta.getEntity(this.entity);
            this.cellValueAttrType = this.entityMetaData.getAttributeType(this.cellValueAttr);

            if (this.cellValueAction !== "count") {
                // For any action other than count, the attribute type must be specified and valid.
                if (this.cellValueAttr === null || this.cellValueAttr === "") {
                    errorMessageArray.push("Action " + this.cellValueAction + " requires a cell value attribute");
                } else {
                    if (this.validActionAttrTypeCombinations.indexOf(this.cellValueAction + "_" + this.cellValueAttrType) < 0) {
                        errorMessageArray.push("Action " + this.cellValueAction + " cannot be used on " + this.cellValueAttr);
                    }
                }
            }

            if (this.tresholdList && this.tresholdList.length) {
                for (tresholdIndex = 0; tresholdIndex < this.tresholdList.length; tresholdIndex = tresholdIndex + 1) {
                    // The property value is always a string, convert it to a value that can be used for comparison
                    switch (this.cellValueAttrType) {
                    case "DateTime":
                        minDateValue = this.parseDate(this.tresholdList[tresholdIndex].minValue, this.cellValueDateformat);
                        this.tresholdList[tresholdIndex].minValue = Number(minDateValue);
                        break;

                    default:
                        this.tresholdList[tresholdIndex].minValue = Number(this.tresholdList[tresholdIndex].minValue);
                    }
                }
            }
        }

        // When onCellClick microflow is specified, the other onCellClick properties must be specified too
        if (this.onCellClickMicroflow !== "") {
            if (this.onCellClickEntity === "") {
                errorMessageArray.push("When On cell click microflow is specified, On cell click entity must be specified too");
            }
            if (this.onCellClickXIdAttr === "") {
                errorMessageArray.push("When On cell click microflow is specified, On cell click X-axis ID attribute must be specified too");
            }

            if (this.onCellClickYIdAttr === "") {
                errorMessageArray.push("When On cell click microflow is specified, On cell click Y-axis ID attribute must be specified too");
            }
        }

        if (errorMessageArray.length > 0) {
            this.showConfigurationErrors(errorMessageArray);
        }

        return (errorMessageArray.length === 0);
    },


    /**
     * Check whether the returned data is correct.
     *
     * @returns {boolean}       True if correct, false otherwise
     */
    checkData: function () {
        'use strict';

        console.log(this.domNode.id + ": checkData");

        var
            errorMessageArray = [];

        if (this.mendixObjectArray !== null) {
            if (Object.prototype.toString.call(this.mendixObjectArray) === "[object Array]") {
                if (this.mendixObjectArray.length > 0 && this.mendixObjectArray[0].getEntity() !== this.entity) {
                    errorMessageArray.push("Microflow " + this.getDataMicroflow + " returns a list of " + this.mendixObjectArray[0].getEntity() +
                        " while the entity property is set to " + this.entity);
                }
            } else {
                errorMessageArray.push("Microflow " + this.getDataMicroflow + " does not return a list of objects");
            }
        } else {
            errorMessageArray.push("Microflow " + this.getDataMicroflow + " does not return a list of objects");
        }

        if (errorMessageArray.length > 0) {
            this.showConfigurationErrors(errorMessageArray);
        }

        return (errorMessageArray.length === 0);
    },

    showConfigurationErrors: function (errorMessageArray) {
        'use strict';

        var
            i,
            listNode;

        this.domNode.appendChild(mxui.dom.p("Configuration error(s) found"));
        dojo.addClass(this.domNode, "PivotDataWidgetConfigurationError");
        listNode = document.createElement("ul");
        for (i = 0; i < errorMessageArray.length; i = i + 1) {
            listNode.appendChild(mxui.dom.li(errorMessageArray[i]));
        }
        this.domNode.appendChild(listNode);
    },


    /**
     * Count action
     *
     * @param valueArray    The value array from the cell map
     * @returns cell value
     */
    getCellElementCount: function (valueArray) {
        'use strict';

        return valueArray.length;
    },

    /**
     * Sum action
     *
     * @param valueArray    The value array from the cell map
     * @returns cell value
     */
    getCellSum: function (valueArray) {
        'use strict';

        var
            i,
            result,
            sum = 0;

        for (i = 0; i < valueArray.length; i = i + 1) {
            sum = sum + valueArray[i];
        }

        result = sum;

        return result;
    },

    /**
     * Average action
     *
     * @param valueArray    The value array from the cell map
     * @returns cell value
     */
    getCellAverage: function (valueArray) {
        'use strict';

        var
            average,
            result;

        average = this.getCellSum(valueArray) / valueArray.length;

        result = average;

        return result;
    },

    /**
     * Min action
     *
     * @param valueArray    The value array from the cell map
     * @returns cell value
     */
    getCellMin: function (valueArray) {
        'use strict';

        var
            i,
            minValue = null,
            result,
            value;

        for (i = 0; i < valueArray.length; i = i + 1) {
            value = valueArray[i];
            if (minValue === null || value < minValue) {
                minValue = value;
            }
        }

        switch (this.cellValueAttrType) {
        case "DateTime":
            result = this.formatDateFromNumber(minValue, this.cellValueDateformat);
            break;

        default:
            result = minValue;
        }

        return result;
    },


    /**
     * Max action
     *
     * @param valueArray    The value array from the cell map
     * @returns cell value
     */
    getCellMax: function (valueArray) {
        'use strict';

        var
            i,
            maxValue = null,
            result,
            value;

        for (i = 0; i < valueArray.length; i = i + 1) {
            value = valueArray[i];
            if (maxValue === null || value > maxValue) {
                maxValue = value;
            }
        }

        switch (this.cellValueAttrType) {
        case "DateTime":
            result = this.formatDateFromNumber(maxValue, this.cellValueDateformat);
            break;

        default:
            result = maxValue;
        }

        return result;
    },

    /**
     * Build table data
     */
    buildTableData: function () {
        'use strict';

        console.log(this.domNode.id + ": buildTableData");

        var
            mendixObject,
            mendixObjectIndex,
            cellMapKey,
            cellMapObject,
            cellValue,
            sortAttr,
            xIdValue,
            xLabelValue,
            xSortValue,
            xSortValueMap = {},
            yIdValue,
            yLabelValue,
            ySortValue,
            ySortValueMap = {};

        console.log(this.domNode.id + ": Process Mendix object array");

        for (mendixObjectIndex = 0; mendixObjectIndex < this.mendixObjectArray.length; mendixObjectIndex = mendixObjectIndex + 1) {
            mendixObject    = this.mendixObjectArray[mendixObjectIndex];
            cellValue       = this.getSortKey(mendixObject, this.cellValueAttr);
            xIdValue        = this.getSortKey(mendixObject, this.xIdAttr);
            yIdValue        = this.getSortKey(mendixObject, this.yIdAttr);
            xLabelValue     = this.getDisplayValue(mendixObject, this.xLabelAttr, this.xLabelDateformat);
            yLabelValue     = this.getDisplayValue(mendixObject, this.yLabelAttr, this.yLabelDateformat);
            if (this.xSortAttr === "label") {
                xSortValue  = xLabelValue;
            } else {
                xSortValue  = xIdValue;
            }
            if (this.ySortAttr === "label") {
                ySortValue  = yLabelValue;
            } else {
                ySortValue  = yIdValue;
            }
            cellMapKey      = xIdValue + "_" + yIdValue;
            if (this.cellMap[cellMapKey]) {
                cellMapObject = this.cellMap[cellMapKey];
                cellMapObject.cellValueArray.push(cellValue);
            } else {
                cellMapObject = {
                    xIdValue        : xIdValue,
                    yIdValue        : yIdValue,
                    cellValueArray  : [cellValue]
                };
                this.cellMap[cellMapKey] = cellMapObject;
            }
            if (!xSortValueMap[xSortValue]) {
                xSortValueMap[xSortValue] = { idValue : xIdValue, labelValue : xLabelValue};
            }
            if (!ySortValueMap[ySortValue]) {
                ySortValueMap[ySortValue] = { idValue : yIdValue, labelValue : yLabelValue};
            }
        }

        console.log(this.domNode.id + ": Perform requested action on the data");

        for (cellMapKey in this.cellMap) {
            if (this.cellMap.hasOwnProperty(cellMapKey)) {
                cellMapObject = this.cellMap[cellMapKey];
                switch (this.cellValueAction) {
                case "sum":
                    cellMapObject.cellValue = this.getCellSum(cellMapObject.cellValueArray);
                    break;

                case "average":
                    cellMapObject.cellValue = this.getCellAverage(cellMapObject.cellValueArray);
                    break;

                case "min":
                    cellMapObject.cellValue = this.getCellMin(cellMapObject.cellValueArray);
                    break;

                case "max":
                    cellMapObject.cellValue = this.getCellMax(cellMapObject.cellValueArray);
                    break;

                default:
                    cellMapObject.cellValue = this.getCellElementCount(cellMapObject.cellValueArray);
                }
            }
        }

        console.log(this.domNode.id + ": Sort the X and Y axis data");

        if (this.xSortAttr === "label") {
            sortAttr = this.xLabelAttr;
        } else {
            sortAttr = this.xIdAttr;
        }
        this.xKeyArray = this.sortAxisData(xSortValueMap, sortAttr, this.xSortDirection);

        if (this.ySortAttr === "label") {
            sortAttr = this.yLabelAttr;
        } else {
            sortAttr = this.yIdAttr;
        }
        this.yKeyArray = this.sortAxisData(ySortValueMap, sortAttr, this.ySortDirection);

    },

    /**
     * Sort the axis data
     *
     * @param sortValueMap      The data to sort
     * @param sortAttr          The name of the sort attribute
     * @param sortDirection     The sort direction
     * @returns                 Sorted array
     */
    sortAxisData : function (sortValueMap, sortAttr, sortDirection) {
        'use strict';

        var
            arrayIndex,
            attrType,
            axisDataArray = [],
            keyArray,
            sortKey,
            sortObject;

        attrType = this.entityMetaData.getAttributeType(sortAttr);
        switch (attrType) {
        case "AutoNumber":
        case "Integer":
        case "Long":
        case "Currency":
        case "Float":
            keyArray = Object.keys(sortValueMap).sort(function (a, b) {return a - b; });
            break;

        case "DateTime":
            keyArray = Object.keys(sortValueMap).sort(function (a, b) {return a.getTime() - b.getTime(); });
            break;

        default:
            keyArray = Object.keys(sortValueMap).sort();
        }

        if (sortDirection === "desc") {
            keyArray.reverse();
        }

        for (arrayIndex = 0; arrayIndex < keyArray.length; arrayIndex = arrayIndex + 1) {
            sortKey = keyArray[arrayIndex];
            sortObject = sortValueMap[sortKey];
            axisDataArray.push(sortObject);
        }

        return axisDataArray;
    },

    /**
     * Create the table
     */
    createTable: function () {
        'use strict';

        console.log(this.domNode.id + ": createTable");

        var
            cellMapKey,
            cellMapObject,
            cellValue,
            colIndex,
            footerRowNode,
            headerRowNode,
            node,
            rowNode,
            rowIndex,
            tableNode,
            tresholdClass,
            tresholdCompareValue,
            tresholdIndex,
            xTotalsMap = {},
            xIdValue,
            xTotal,
            yIdValue,
            yLabelValue,
            yTotal;

        // Create table
        tableNode = document.createElement("table");

        // Header row
        headerRowNode = document.createElement("tr");
        headerRowNode.appendChild(document.createElement("th"));
        for (colIndex = 0; colIndex < this.xKeyArray.length; colIndex = colIndex + 1) {
            headerRowNode.appendChild(this.createHeaderNode(this.xKeyArray[colIndex].labelValue));
        }
        if (this.showTotalColumn) {
            headerRowNode.appendChild(this.createHeaderNode(this.totalColumnLabel));
        }
        tableNode.appendChild(headerRowNode);

        // Rows
        for (rowIndex = 0; rowIndex < this.yKeyArray.length; rowIndex = rowIndex + 1) {
            rowNode = document.createElement("tr");
            if (rowIndex % 2 === 0) {
                dojo.addClass(rowNode, this.evenRowClass);
            } else {
                dojo.addClass(rowNode, this.oddRowClass);
            }

            // Get the label and the ID
            yLabelValue = this.yKeyArray[rowIndex].labelValue;
            yIdValue = this.yKeyArray[rowIndex].idValue;

            // The row label
            node = mxui.dom.th(yLabelValue);
            dojo.addClass(node, this.yLabelClass);
            rowNode.appendChild(node);

            // Columns
            yTotal = 0;
            for (colIndex = 0; colIndex < this.xKeyArray.length; colIndex = colIndex + 1) {
                // Get the ID
                xIdValue            = this.xKeyArray[colIndex].idValue;
                cellMapKey          = xIdValue + "_" + yIdValue;
                // It is possible that no values exists for a given combination of the two IDs
                tresholdClass = null;
                if (this.cellMap[cellMapKey]) {
                    cellMapObject   = this.cellMap[cellMapKey];
                    cellValue       = cellMapObject.cellValue;
                    // Process the styling tresholds, if requested
                    if (this.tresholdList && this.tresholdList.length) {
                        for (tresholdIndex = 0; tresholdIndex < this.tresholdList.length; tresholdIndex = tresholdIndex + 1) {
                            switch (this.cellValueAttrType) {
                            case "DateTime":
                                tresholdCompareValue = this.parseDate(cellValue, this.cellValueDateformat);
                                break;

                            default:
                                tresholdCompareValue = cellValue;
                            }
                            if (tresholdCompareValue >= this.tresholdList[tresholdIndex].minValue) {
                                tresholdClass = this.tresholdList[tresholdIndex].additionalClass;
                            } else {
                                break;
                            }
                        }
                    }
                    // Process the totals, if requested
                    if (this.showTotalColumn) {
                        yTotal       = yTotal + cellValue;
                    }
                    if (this.showTotalRow) {
                        if (xTotalsMap[xIdValue]) {
                            xTotal = xTotalsMap[xIdValue] + cellValue;
                        } else {
                            xTotal = cellValue;
                        }
                        xTotalsMap[xIdValue] = xTotal;
                    }
                } else {
                    cellValue       = "&nbsp;";
                }
                node                = document.createElement("td");
                switch (this.cellValueAttrType) {
                case "Currency":
                    node.innerHTML = this.formatCurrency(cellValue);
                    break;

                case "Integer":
                case "Long":
                    node.innerHTML = dojo.number.format(cellValue, { places: this.precisionForAverage });
                    break;

                default:
                    node.innerHTML      = cellValue;
                }
                dojo.addClass(node, this.cellClass);
                if (this.onCellClickMicroflow !== "") {
                    node.setAttribute(this.xIdAttr, xIdValue);
                    node.setAttribute(this.yIdAttr, yIdValue);
                    dojo.addClass(node, this.onCellClickClass);
                    node.onclick = dojo.hitch(this, this.onClickCell);
                }
                // Additional class based on the treshold?
                if (tresholdClass) {
                    dojo.addClass(node, tresholdClass);
                }
                rowNode.appendChild(node);
            }
            if (this.showTotalColumn) {
                node                = document.createElement("td");
                switch (this.cellValueAttrType) {
                case "Currency":
                    node.innerHTML = this.formatCurrency(yTotal);
                    break;

                default:
                    node.innerHTML      = yTotal;
                }
                dojo.addClass(node, this.totalColumnCellClass);
                rowNode.appendChild(node);
            }

            tableNode.appendChild(rowNode);
        }

        if (this.showTotalRow) {
            // Footer row containing the totals for each column
            footerRowNode = document.createElement("tr");
            dojo.addClass(footerRowNode, this.totalRowClass);
            node = mxui.dom.td(this.totalRowLabel);
            dojo.addClass(node, this.yLabelClass);
            footerRowNode.appendChild(node);
            yTotal = 0;
            for (colIndex = 0; colIndex < this.xKeyArray.length; colIndex = colIndex + 1) {
                // Get the ID
                xIdValue            = this.xKeyArray[colIndex].idValue;
                cellValue           = xTotalsMap[xIdValue];
                yTotal              = yTotal + cellValue;
                node                = document.createElement("td");
                switch (this.cellValueAttrType) {
                case "Currency":
                    node.innerHTML = this.formatCurrency(cellValue);
                    break;

                default:
                    node.innerHTML      = cellValue;
                }
                dojo.addClass(node, this.totalRowCellClass);
                footerRowNode.appendChild(node);
            }
            node                = document.createElement("td");
            switch (this.cellValueAttrType) {
            case "Currency":
                node.innerHTML = this.formatCurrency(yTotal);
                break;

            default:
                node.innerHTML      = yTotal;
            }
            dojo.addClass(node, this.totalRowCellClass);
            footerRowNode.appendChild(node);

            tableNode.appendChild(footerRowNode);
        }

        // Show the table
        this.domNode.appendChild(tableNode);

    },

    /**
     * Create a header cell node.
     *
     * @param headerValue   The value to show in the header
     * @@returns The node
     */
    createHeaderNode : function (headerValue) {
        'use strict';

        var
            divNode,
            headerNode,
            spanNode;

        // Create the span containing the header value
        spanNode = mxui.dom.span(headerValue);

        // Create the div
        divNode = document.createElement("div");
        divNode.appendChild(spanNode);

        // Create the th
        headerNode = document.createElement("th");
        headerNode.appendChild(divNode);
        dojo.addClass(headerNode, this.xLabelClass);

        return headerNode;

    },

    /**
     * Called when the user clicks on a cell
     *
     * @param evt  The click event
     */
    onClickCell : function (evt) {
        'use strict';
        console.log("onClickCell");
        console.dir(evt);
        this.onClickXIdValue = evt.target.getAttribute(this.xIdAttr);
        this.onClickYIdValue = evt.target.getAttribute(this.yIdAttr);
        mx.data.create({
            entity   : this.onCellClickEntity,
            callback : dojo.hitch(this, this.onClickCellObjectCreated),
            error    : dojo.hitch(this, this.onClickCellObjectCreateError)
        });
    },

    /**
     * Called upon creation of onCellClickEntity
     *
     * @param mendixObject  The new Mendix object
     */
    onClickCellObjectCreated : function (mendixObject) {
        'use strict';

        console.log("onClickCellObjectCreated");

        mendixObject.set(this.onCellClickXIdAttr, this.onClickXIdValue);
        mendixObject.set(this.onCellClickYIdAttr, this.onClickYIdValue);
        if (this.onCellClickReferenceName) {
            mendixObject.addReference(this.onCellClickReferenceName, this.contextGUID);
        }
        console.log("Commit object");
        this.onClickMendixObject = mendixObject;
        mx.data.commit({
            mxobj    : mendixObject,
            callback : dojo.hitch(this, this.onClickMendixObjectCommitted),
            error    : dojo.hitch(this, this.onClickMendixObjectCommitError)
        });
    },

    /**
     * Called after creation of onCellClickEntity failed
     *
     */
    onClickMendixObjectCommitted : function () {
        'use strict';

        console.log("onClickMendixObjectCommitted");
        mx.data.action({
            params       : {
                applyto     : "selection",
                actionname  : this.onCellClickMicroflow,
                guids : [this.onClickMendixObject.getGuid()]
            },
            error        : dojo.hitch(this, this.onClickCellMicroflowError),
            onValidation : dojo.hitch(this, this.onClickCellMicroflowError)
        });

    },

    /**
     * Called after creation of onCellClickEntity failed
     *
     * @param err       The error object, if any
     */
    onClickCellObjectCreateError : function (err) {
        'use strict';

        console.dir(err);
        alert("Create object of entity " + this.onCellClickEntity + " ended with an error");

    },

    /**
     * Called after commit of onCellClickEntity failed
     *
     * @param err       The error object, if any
     */
    onClickMendixObjectCommitError : function (err) {
        'use strict';

        console.dir(err);
        alert("Commit object of entity " + this.onCellClickEntity + " ended with an error");

    },

    /**
     * Call to onClickCell microflow failed
     *
     * @param err       The error object, if any
     */
    onClickCellMicroflowError : function (err) {
        'use strict';

        console.dir(err);
        alert("Call to microflow " + this.onCellClickMicroflow + " ended with an error");

    },

    /**
     * Get the attribute value for use as sort key
     *
     * @param mendixObject  The Mendix object to take the value from
     * @param attrName      The attribute name
     * @returns {string}    The sort key
     */
    getSortKey : function (mendixObject, attrName) {
        'use strict';

        var
            attrType,
            attrValue,
            result;

        attrType = this.entityMetaData.getAttributeType(attrName);
        attrValue = mendixObject.get(attrName);

        switch (attrType) {
        case "AutoNumber":
        case "Integer":
        case "Long":
        case "Currency":
        case "Float":
        case "DateTime":
            result = Number(attrValue);
            break;

        default:
            result = attrValue;
        }

        return result;
    },

    /**
     * Get the attribute value for use as display value
     *
     * @param mendixObject  The Mendix object to take the value from
     * @param attrName      The attribute name
     * @param dateFormat    The date format to use for DateTime attributes
     * @returns {string}    The sort key
     */
    getDisplayValue : function (mendixObject, attrName, dateFormat) {
        'use strict';

        var
            attrType,
            attrValue,
            result;

        attrType = this.entityMetaData.getAttributeType(attrName);
        attrValue = mendixObject.get(attrName);

        switch (attrType) {
        case "Currency":
            result = this.formatCurrency(attrValue);
            break;
        case "DateTime":
            result = this.formatDateFromNumber(attrValue, dateFormat);
            break;

        case "Enum":
            result = this.entityMetaData.getEnumCaption(attrName, attrValue);
            break;

        default:
            result = attrValue;
        }

        return result;
    },

    /**
     * Show progress indicator, depends on Mendix version
     */
    showProgress: function () {
        'use strict';
        this.progressDialogId = mx.ui.showProgress();
    },

    /**
     * Hide progress indicator, depends on Mendix version
     */
    hideProgress: function () {
        'use strict';
        mx.ui.hideProgress(this.progressDialogId);
        this.progressDialogId = null;
    },

    /**
     * Parse a string into a date
     *
     * @param dateString    The date value
     * @param dateFormat    The date format string
     * @returns {Date}      The date
     */
    parseDate: function (dateString, dateFormat) {
        'use strict';

        var
            result;

        if (mx.parser.parseValue) {
            result = mx.parser.parseValue(dateString, "datetime", { datePattern: dateFormat});
        } else {
            result = dojo.date.locale.parse(dateString, { selector : "date", datePattern: dateFormat});
        }

        return result;
    },

    /**
     * Format a currency value
     *
     * @param value         The value to format
     * @returns {String}    The formatted value
     */
    formatCurrency: function (value) {
        'use strict';

        var
            result;

        if (mx.parser.formatValue) {
            result = mx.parser.formatValue(value, "currency");
        } else {
            result = dojo.number.format(value, { places: 2 });
        }

        return result;
    },

    /**
     * Format a date using a number
     *
     * @param value         The date in milliseconds since the epoch.
     * @param dateFormat    The date format to use
     * @returns {String}    The formatted value
     */
    formatDateFromNumber: function (value, dateFormat) {
        'use strict';

        var
            result;

        if (mx.parser.formatValue) {
            result = mx.parser.formatValue(new Date(value), "datetime", { datePattern: dateFormat});
        } else {
            result = dojo.date.locale.format(new Date(value), { selector : "date", datePattern: dateFormat});
        }

        return result;
    },

	/**
	 * How the widget re-acts from actions invoked by the Mendix App.
	 */
	suspend : function () {
		'use strict';
        console.log(this.domNode.id + ": suspend");
	},

	resume : function () {
		'use strict';
        console.log(this.domNode.id + ": resume");
	},

	enable : function () {
		'use strict';
        console.log(this.domNode.id + ": enable");
	},

	disable : function () {
		'use strict';
        console.log(this.domNode.id + ": disable");
	},

    /**
     * Cleanup upon destruction of the widget instance.
     *
     */
    uninitialize: function () {
        'use strict';
        console.log(this.domNode.id + ": uninitialize");
        if (this.handle) {
            mx.data.unsubscribe(this.handle);
        }
        if (this.progressDialogId) {
            this.hideProgress();
        }
    }
});