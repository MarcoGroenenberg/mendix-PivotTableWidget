/*jslint browser:true, nomen:true, plusplus: true */
/*global mx, mendix, require, console, alert, define, module, logger */
/**

	PivotDataWidget
	========================

	@file      : PivotDataWidget.js
	@author    : Marcel Groeneweg
	@date      : 22-12-2014
	@copyright : Synobsys
	@license   : Apache License, Version 2.0, January 2004

	Documentation
    ========================
	Pivot table widget

*/

(function () {
    'use strict';

    require([

        'dojo/_base/declare', 'mxui/widget/_WidgetBase', 'dijit/_Widget', 'big/big',
        'mxui/dom', 'dojo/dom-class', 'dojo/dom-construct', 'dojo/_base/lang', 'dojo/number', 'dojo/_base/array', 'dojo/date/locale'

    ], function (declare, _WidgetBase, _Widget, Big, domMx, domClass, domConstruct, lang, dojoNumber, dojoArray, dojoDateLocale) {

        // Declare widget.
        return declare('PivotDataWidget.widget.PivotDataWidget', [ _WidgetBase, _Widget ], {

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
                "sum_Decimal",
                "sum_Integer",
                "sum_Long",
                "average_Currency",
                "average_Decimal",
                "average_Integer",
                "average_Long",
                "min_Currency",
                "min_DateTime",
                "min_Decimal",
                "min_Integer",
                "min_Long",
                "max_Currency",
                "max_DateTime",
                "max_Decimal",
                "max_Integer",
                "max_Long",
                "display_String",
                "display_Enum"
            ],
            onClickXIdValue                 : null,
            onClickYIdValue                 : null,
            onClickMendixObject             : null,
            onCellClickReferenceName        : null,
            exportMendixObject              : null,

            /**
             * Called by the Mendix runtime after creation.
             */
            postCreate: function () {
                domClass.add(this.domNode, "PivotDataWidget");

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
                var
                    thisObj = this;

                // console.log(this.domNode.id + ": applyContext");

                if (this.handle) {
                    mx.data.unsubscribe(this.handle);
                }

                if (context) {
                    this.widgetContext = context;
                    this.contextGUID = context.getTrackID();
                    // console.log(this.domNode.id + ": applyContext, context object GUID: " + this.contextGUID);
                    if (this.checkProperties()) {
                        if (this.callGetDataMicroflow === "crtOnly" || this.callGetDataMicroflow === "crtAndChg") {
                            thisObj.getData();
                        }
                        if (this.callGetDataMicroflow === "crtAndChg" || this.callGetDataMicroflow === "chgOnly") {
                            this.handle = mx.data.subscribe({
                                guid: this.contextGUID,
                                callback: lang.hitch(this, this.contextObjectChangedCallback)
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

                // console.log(this.domNode.id + ": Context object has changed");
                this.getData();
            },

            /**
             * Call the microflow to get the data
             */
            getData: function () {

                // console.log(this.domNode.id + ": Call microflow to get the data");

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
                    callback: lang.hitch(this, this.dataMicroflowCallback),
                    error: lang.hitch(this, this.dataMicroflowError)
                };
                mx.data.action(args);
            },

            /**
             * Called upon completion of the microflow
             *
             * @param mendixObjectArray      The list as returned from the microflow
             */
            dataMicroflowCallback: function (mendixObjectArray) {

                var
                    noDataNode;

                // console.log(this.domNode.id + ": dataMicroflowCallback");

                this.getDataMicroflowCallPending = false;
                this.hideProgress();

                this.mendixObjectArray = mendixObjectArray;

                // Remove any old data
                domConstruct.empty(this.domNode);
                this.cellMap        = {};
                this.xKeyArray      = [];
                this.yKeyArray      = [];

                if (this.checkData()) {
                    if (this.mendixObjectArray.length > 0) {
                        this.buildTableData();
                        this.createTable();
                    } else {
                        noDataNode = domMx.p(this.noDataText);
                        domClass.add(noDataNode, this.noDataTextClass);
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

                // console.log(this.domNode.id + ": checkProperties");

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

                if (this.cellValueAction === "display") {
                    if (this.tresholdList && this.tresholdList.length && this.tresholdList.length > 0) {
                        errorMessageArray.push("Styling tresholds are not allowed for action Display");
                    }
                } else {
                    if (this.useDisplayValueForCss) {
                        errorMessageArray.push("Use value as css class is only allowed for action Display");
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
                            if (this.cellValueAction === "count") {
                                this.tresholdList[tresholdIndex].minValue = new Big(this.tresholdList[tresholdIndex].minValue);
                            } else {
                                switch (this.cellValueAttrType) {
                                case "DateTime":
                                    minDateValue = this.parseDate(this.tresholdList[tresholdIndex].minValue, this.cellValueDateformat);
                                    this.tresholdList[tresholdIndex].minValue = new Big(minDateValue.getTime());
                                    break;

                                default:
                                    this.tresholdList[tresholdIndex].minValue = new Big(this.tresholdList[tresholdIndex].minValue);
                                }
                            }
                        }
                    }
                    
                    if (this.cellValueAttrType === "Decimal") {
                        if (this.precisionForDecimal < 0 || this.precisionForDecimal > 10) {
                            errorMessageArray.push("Decimal precision for Decimal must be between 0 and 10");
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

                // When export is allowed export properties must be specified too
                if (this.allowExport) {
                    if (this.exportToCsvEntity === "") {
                        errorMessageArray.push("When export is allowed, Export to CSV entity must be specified too");
                    }
                    if (this.exportToCsvMicroflow === "") {
                        errorMessageArray.push("When export is allowed, Export to CSV microflow must be specified too");
                    }
                    if (this.exportToCsvAttr === "") {
                        errorMessageArray.push("When export is allowed, Export to CSV attribute must be specified too");
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

                // console.log(this.domNode.id + ": checkData");

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

                var
                    i,
                    listNode;

                this.domNode.appendChild(domMx.p("Configuration error(s) found"));
                domClass.add(this.domNode, "PivotDataWidgetConfigurationError");
                listNode = document.createElement("ul");
                for (i = 0; i < errorMessageArray.length; i = i + 1) {
                    listNode.appendChild(domMx.li(errorMessageArray[i]));
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

                return new Big(valueArray.length);
            },

            /**
             * Sum action
             *
             * @param valueArray    The value array from the cell map
             * @returns cell value
             */
            getCellSum: function (valueArray) {

                var
                    i,
                    result,
                    sumDecimal = new Big(0),
                    sum = 0;

                switch (this.cellValueAttrType) {
                case "Decimal":
                    for (i = 0; i < valueArray.length; i = i + 1) {
                        sumDecimal = sumDecimal.plus(valueArray[i]);
                    }
                    return sumDecimal;

                default:
                    for (i = 0; i < valueArray.length; i = i + 1) {
                        sum = sum + valueArray[i];
                    }
                    return sum;
                }

            },

            /**
             * Average action
             *
             * @param valueArray    The value array from the cell map
             * @returns cell value
             */
            getCellAverage: function (valueArray) {


                switch (this.cellValueAttrType) {
                case "Decimal":
                    return this.getCellSum(valueArray).div(valueArray.length);

                default:
                    return this.getCellSum(valueArray) / valueArray.length;
                }
            },

            /**
             * Min action
             *
             * @param valueArray    The value array from the cell map
             * @returns cell value
             */
            getCellMin: function (valueArray) {

                var
                    i,
                    minValue = null,
                    result,
                    value;

                switch (this.cellValueAttrType) {
                case "Decimal":
                    for (i = 0; i < valueArray.length; i = i + 1) {
                        value = valueArray[i];
                        if (minValue === null || value.lt(minValue)) {
                            minValue = value;
                        }
                    }
                    break;

                default:
                    for (i = 0; i < valueArray.length; i = i + 1) {
                        value = valueArray[i];
                        if (minValue === null || value < minValue) {
                            minValue = value;
                        }
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

                var
                    i,
                    maxValue = null,
                    result,
                    value;

                switch (this.cellValueAttrType) {
                case "Decimal":
                    for (i = 0; i < valueArray.length; i = i + 1) {
                        value = valueArray[i];
                        if (maxValue === null || value.gt(maxValue)) {
                            maxValue = value;
                        }
                    }
                    break;

                default:
                    for (i = 0; i < valueArray.length; i = i + 1) {
                        value = valueArray[i];
                        if (maxValue === null || value > maxValue) {
                            maxValue = value;
                        }
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
             * Display action
             *
             * @param valueArray    The value array from the cell map
             * @returns cell value
             */
            getCellDisplayValue: function (valueArray) {
                return valueArray.join();
            },

            /**
             * Build table data
             */
            buildTableData: function () {

                // console.log(this.domNode.id + ": buildTableData");

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

                // console.log(this.domNode.id + ": Process Mendix object array");

                for (mendixObjectIndex = 0; mendixObjectIndex < this.mendixObjectArray.length; mendixObjectIndex = mendixObjectIndex + 1) {
                    mendixObject    = this.mendixObjectArray[mendixObjectIndex];
                    // For display, convert to display value as no aggregation will take place.
                    if (this.cellValueAction === "display") {
                        cellValue   = this.getDisplayValue(mendixObject, this.cellValueAttr, this.cellValueDateformat);
                    } else {
                        cellValue   = this.getSortKey(mendixObject, this.cellValueAttr);
                    }
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
                        // Save sort key value in the map object too, used as additional styling CSS class
                        // Only for the first object; CSS class is not applied when multiple objects exist for one cell.
                        if (this.useDisplayValueForCss) {
                            cellMapObject.displayCssValue = this.getSortKey(mendixObject, this.cellValueAttr);
                        }
                        this.cellMap[cellMapKey] = cellMapObject;
                    }
                    if (!xSortValueMap[xSortValue]) {
                        xSortValueMap[xSortValue] = { idValue : xIdValue, labelValue : xLabelValue};
                    }
                    if (!ySortValueMap[ySortValue]) {
                        ySortValueMap[ySortValue] = { idValue : yIdValue, labelValue : yLabelValue};
                    }
                }

                // console.log(this.domNode.id + ": Perform requested action on the data");

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

                        case "display":
                            cellMapObject.cellValue = this.getCellDisplayValue(cellMapObject.cellValueArray);
                            break;

                        default:
                            cellMapObject.cellValue = this.getCellElementCount(cellMapObject.cellValueArray);
                        }
                    }
                }

                // console.log(this.domNode.id + ": Sort the X and Y axis data");

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
                case "DateTime":
                    keyArray = Object.keys(sortValueMap).sort(function (a, b) {return a - b; });
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

                // console.log(this.domNode.id + ": createTable");

                var
                    cellMapKey,
                    cellMapObject,
                    cellValue,
                    colIndex,
                    displayValueCellClass,
                    exportButton,
                    footerRowNode,
                    headerRowNode,
                    node,
                    nodeValue,
                    rowNode,
                    rowIndex,
                    tableNode,
                    topLeftCellNode,
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
                topLeftCellNode = document.createElement("th");
                if (this.allowExport) {
                    exportButton = document.createElement('button');
                    exportButton.setAttribute('type', 'button');
                    domClass.add(exportButton, 'btn mx-button btn-default ' + this.exportButtonClass);
                    if (this.exportButtonCaption) {
                        exportButton.innerHTML = this.exportButtonCaption;
                    }
                    exportButton.onclick = lang.hitch(this, this.exportData);
                    topLeftCellNode.appendChild(exportButton);
                }
                headerRowNode.appendChild(topLeftCellNode);
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
                        domClass.add(rowNode, this.evenRowClass);
                    } else {
                        domClass.add(rowNode, this.oddRowClass);
                    }

                    // Get the label and the ID
                    yLabelValue = this.yKeyArray[rowIndex].labelValue;
                    yIdValue = this.yKeyArray[rowIndex].idValue;

                    // The row label
                    node = domMx.th(yLabelValue);
                    domClass.add(node, this.yLabelClass);
                    rowNode.appendChild(node);

                    // Columns                    
                    yTotal = new Big(0);
                    for (colIndex = 0; colIndex < this.xKeyArray.length; colIndex = colIndex + 1) {
                        // Get the ID
                        xIdValue            = this.xKeyArray[colIndex].idValue;
                        cellMapKey          = xIdValue + "_" + yIdValue;
                        // It is possible that no values exists for a given combination of the two IDs
                        tresholdClass = null;
                        displayValueCellClass = null;
                        if (this.cellMap[cellMapKey]) {
                            cellMapObject   = this.cellMap[cellMapKey];
                            cellValue       = cellMapObject.cellValue;
                            // Process the styling tresholds, if requested
                            if (this.tresholdList && this.tresholdList.length) {
                                for (tresholdIndex = 0; tresholdIndex < this.tresholdList.length; tresholdIndex = tresholdIndex + 1) {
                                    switch (this.cellValueAttrType) {
                                    case "DateTime":
                                        tresholdCompareValue = new Big(this.parseDate(cellValue, this.cellValueDateformat).getTime());
                                        break;

                                    default:
                                        tresholdCompareValue = new Big(cellValue);
                                    }
                                    if (tresholdCompareValue.gt(this.tresholdList[tresholdIndex].minValue)) {
                                        tresholdClass = this.tresholdList[tresholdIndex].additionalClass;
                                    } else {
                                        break;
                                    }
                                }
                            }
                            // Action display, use value as CSS class?
                            if (this.useDisplayValueForCss) {
                                if (cellMapObject.cellValueArray.length === 1 && cellMapObject.displayCssValue) {
                                    // Suppress jslint warning about unsecure regex. I'm replacing anything that is not a true alphanumeric character. That would include any weird unicode stuff.
                                    /*jslint regexp: true */
                                    displayValueCellClass = this.displayValueClass + cellMapObject.displayCssValue.replace(/[^A-Za-z0-9]/g, '_');
                                    /*jslint regexp: false */
                                }
                            }
                            // Process the totals, if requested
                            if (this.showTotalColumn) {
                                yTotal = yTotal.plus(cellValue);
                            }
                            if (this.showTotalRow) {
                                if (xTotalsMap[xIdValue]) {
                                    xTotal = xTotalsMap[xIdValue].plus(cellValue);
                                } else {
                                    xTotal = new Big(cellValue);
                                }
                                xTotalsMap[xIdValue] = xTotal;
                            }
                            switch (this.cellValueAttrType) {
                            case "Currency":
                                nodeValue = this.formatCurrency(cellValue);
                                break;

                            case "Decimal":
                                nodeValue = this.formatDecimal(cellValue);
                                break;

                            case "Integer":
                            case "Long":
                                nodeValue = dojoNumber.format(cellValue, { places: this.precisionForAverage });
                                break;

                            default:
                                nodeValue      = cellValue;
                            }
                        } else {
                            nodeValue       = "&nbsp;";
                        }
                        node                = document.createElement("td");
                        node.innerHTML      = nodeValue;
                        domClass.add(node, this.cellClass);
                        if (this.onCellClickMicroflow !== "") {
                            node.setAttribute(this.xIdAttr, xIdValue);
                            node.setAttribute(this.yIdAttr, yIdValue);
                            domClass.add(node, this.onCellClickClass);
                            node.onclick = lang.hitch(this, this.onClickCell);
                        }
                        // Additional class based on the treshold?
                        if (tresholdClass) {
                            domClass.add(node, tresholdClass);
                        }
                        // Additional class for display?
                        if (displayValueCellClass) {
                            domClass.add(node, displayValueCellClass);
                        }
                        rowNode.appendChild(node);
                    }
                    if (this.showTotalColumn) {
                        // Totals are always Decimal objects!
                        node                = document.createElement("td");
                        switch (this.cellValueAttrType) {
                        case "Currency":
                            node.innerHTML = this.formatDecimal(yTotal, 2);
                            break;

                        case "Decimal":
                            node.innerHTML = this.formatDecimal(yTotal);
                            break;

                        default:
                            node.innerHTML = this.formatDecimal(yTotal, 0);
                        }
                        domClass.add(node, this.totalColumnCellClass);
                        rowNode.appendChild(node);
                    }

                    tableNode.appendChild(rowNode);
                }

                if (this.showTotalRow) {
                    // Footer row containing the totals for each column
                    // Totals are always Decimal objects!
                    footerRowNode = document.createElement("tr");
                    domClass.add(footerRowNode, this.totalRowClass);
                    node = domMx.td(this.totalRowLabel);
                    domClass.add(node, this.yLabelClass);
                    footerRowNode.appendChild(node);
                    yTotal = new Big(0);
                    for (colIndex = 0; colIndex < this.xKeyArray.length; colIndex = colIndex + 1) {
                        // Get the ID
                        xIdValue            = this.xKeyArray[colIndex].idValue;
                        cellValue           = xTotalsMap[xIdValue];
                        yTotal              = yTotal.plus(cellValue);
                        node                = document.createElement("td");
                        switch (this.cellValueAttrType) {
                        case "Currency":
                            node.innerHTML = this.formatDecimal(cellValue, 2);
                            break;

                        case "Decimal":
                            node.innerHTML = this.formatDecimal(cellValue);
                            break;
                                
                        default:
                            node.innerHTML = this.formatDecimal(cellValue, 0);
                        }
                        domClass.add(node, this.totalRowCellClass);
                        footerRowNode.appendChild(node);
                    }
                    node                = document.createElement("td");
                    switch (this.cellValueAttrType) {
                    case "Currency":
                        node.innerHTML = this.formatDecimal(yTotal, 2);
                        break;

                    case "Decimal":
                        node.innerHTML = this.formatDecimal(yTotal);
                        break;

                    default:
                        node.innerHTML = this.formatDecimal(yTotal, 0);
                    }
                    domClass.add(node, this.totalRowCellClass);
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

                var
                    divNode,
                    headerNode,
                    spanNode;

                // Create the span containing the header value
                spanNode = domMx.span(headerValue);

                // Create the div
                divNode = document.createElement("div");
                divNode.appendChild(spanNode);

                // Create the th
                headerNode = document.createElement("th");
                headerNode.appendChild(divNode);
                domClass.add(headerNode, this.xLabelClass);

                return headerNode;

            },

            /**
             * Called when the user clicks on a cell
             *
             * @param evt  The click event
             */
            onClickCell : function (evt) {
                // console.log("onClickCell");
                // console.dir(evt);
                this.onClickXIdValue = evt.target.getAttribute(this.xIdAttr);
                this.onClickYIdValue = evt.target.getAttribute(this.yIdAttr);
                mx.data.create({
                    entity   : this.onCellClickEntity,
                    callback : lang.hitch(this, this.onClickCellObjectCreated),
                    error    : lang.hitch(this, this.onClickCellObjectCreateError)
                });
            },

            /**
             * Called upon creation of onCellClickEntity
             *
             * @param mendixObject  The new Mendix object
             */
            onClickCellObjectCreated : function (mendixObject) {

                // console.log("onClickCellObjectCreated");

                mendixObject.set(this.onCellClickXIdAttr, this.onClickXIdValue);
                mendixObject.set(this.onCellClickYIdAttr, this.onClickYIdValue);
                if (this.onCellClickReferenceName) {
                    mendixObject.addReference(this.onCellClickReferenceName, this.contextGUID);
                }
                // console.log("Commit object");
                this.onClickMendixObject = mendixObject;
                mx.data.commit({
                    mxobj    : mendixObject,
                    callback : lang.hitch(this, this.onClickMendixObjectCommitted),
                    error    : lang.hitch(this, this.onClickMendixObjectCommitError)
                });
            },

            /**
             * Called after object committed
             *
             */
            onClickMendixObjectCommitted : function () {

                // console.log("onClickMendixObjectCommitted");
                mx.data.action({
                    params       : {
                        applyto     : "selection",
                        actionname  : this.onCellClickMicroflow,
                        guids : [this.onClickMendixObject.getGuid()]
                    },
                    error        : lang.hitch(this, this.onClickCellMicroflowError),
                    onValidation : lang.hitch(this, this.onClickCellMicroflowError)
                });

            },

            /**
             * Called after creation of onCellClickEntity failed
             *
             * @param err       The error object, if any
             */
            onClickCellObjectCreateError : function (err) {

                console.dir(err);
                alert("Create object of entity " + this.onCellClickEntity + " ended with an error");

            },

            /**
             * Called after commit of onCellClickEntity failed
             *
             * @param err       The error object, if any
             */
            onClickMendixObjectCommitError : function (err) {

                console.dir(err);
                alert("Commit object of entity " + this.onCellClickEntity + " ended with an error");

            },

            /**
             * Call to onClickCell microflow failed
             *
             * @param err       The error object, if any
             */
            onClickCellMicroflowError : function (err) {

                console.dir(err);
                alert("Call to microflow " + this.onCellClickMicroflow + " ended with an error");

            },


            /**
             * Called when the user requests an export of the data
             *
             * @param evt  The click event
             */
            exportData : function (evt) {
                // console.log("exportData");
                // console.dir(evt);
                mx.data.create({
                    entity   : this.exportToCsvEntity,
                    callback : lang.hitch(this, this.exportDataObjectCreated),
                    error    : lang.hitch(this, this.exportDataObjectCreateError)
                });
            },

            /**
             * Called upon creation of exportToCsvEntity
             *
             * @param mendixObject  The new Mendix object
             */
            exportDataObjectCreated : function (mendixObject) {

                // console.log("exportDataObjectCreated");
                var
                    exportData = '',
                    useQuotes = true;

                if (this.cellValueAction === "count") {
                    useQuotes = false;
                } else {
                    if (this.cellValueAttrType !== "DateTime") {
                        useQuotes = false;
                    }
                }

                dojoArray.forEach(this.domNode.firstChild.childNodes, function (row, rowIndex) {
                    dojoArray.forEach(row.childNodes, function (cell, colIndex) {
                        if (rowIndex === 0) {
                            if (colIndex === 0) {
                                exportData += '""';
                            } else {
                                exportData += ',"' + cell.textContent + '"';
                            }
                        } else {
                            if (colIndex === 0) {
                                exportData += '"' + cell.textContent + '"';
                            } else {
                                if (useQuotes) {
                                    exportData += ',"';
                                } else {
                                    exportData += ',';
                                }
                                exportData += cell.textContent;
                                if (useQuotes) {
                                    exportData += '"';
                                }
                            }
                        }
                    });
                    exportData += '\r\n';
                });

                mendixObject.set(this.exportToCsvAttr, exportData);
                // console.log("Commit object");
                this.exportMendixObject = mendixObject;
                mx.data.commit({
                    mxobj    : mendixObject,
                    callback : lang.hitch(this, this.exportMendixObjectCommitted),
                    error    : lang.hitch(this, this.exportMendixObjectCommitError)
                });
            },

            /**
             * Called after creation of exportToCsvEntity failed
             *
             */
            exportMendixObjectCommitted : function () {

                // console.log("exportMendixObjectCommitted");
                mx.data.action({
                    params       : {
                        applyto     : "selection",
                        actionname  : this.exportToCsvMicroflow,
                        guids : [this.exportMendixObject.getGuid()]
                    },
                    error        : lang.hitch(this, this.exportDataMicroflowError),
                    onValidation : lang.hitch(this, this.exportDataMicroflowError)
                });

            },

            /**
             * Called after creation of exportToCsvEntity failed
             *
             * @param err       The error object, if any
             */
            exportDataObjectCreateError : function (err) {

                console.dir(err);
                alert("Create object of entity " + this.exportToCsvEntity + " ended with an error");

            },

            /**
             * Called after commit of exportToCsvEntity failed
             *
             * @param err       The error object, if any
             */
            exportMendixObjectCommitError : function (err) {

                console.dir(err);
                alert("Commit object of entity " + this.exportToCsvEntity + " ended with an error");

            },

            /**
             * Call to exportData microflow failed
             *
             * @param err       The error object, if any
             */
            exportDataMicroflowError : function (err) {

                console.dir(err);
                alert("Call to microflow " + this.exportDataMicroflow + " ended with an error");

            },    /**
             * Get the attribute value for use as sort key
             *
             * @param mendixObject  The Mendix object to take the value from
             * @param attrName      The attribute name
             * @returns {string}    The sort key
             */
            getSortKey : function (mendixObject, attrName) {

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
                case "DateTime":
                    result = Number(attrValue);
                    break;

                case "Decimal":
                    result = attrValue;
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
                this.progressDialogId = mx.ui.showProgress();
            },

            /**
             * Hide progress indicator, depends on Mendix version
             */
            hideProgress: function () {
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

                var
                    result;

                if (mx.parser.parseValue) {
                    result = mx.parser.parseValue(dateString, "datetime", { datePattern: dateFormat});
                } else {
                    result = dojoDateLocale.parse(dateString, { selector : "date", datePattern: dateFormat});
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

                var
                    result;

                if (mx.parser.formatValue) {
                    result = mx.parser.formatValue(value, "currency");
                } else {
                    result = dojoNumber.format(value, { places: 2 });
                }

                return result;
            },

            /**
             * Format a decimal value
             *
             * @param value         The value to format
             * @param precision     The number of decimals to use, optional, precisionForDecimal is used if not specified
             * @returns {String}    The formatted value
             */
            formatDecimal: function (value, precision) {

                if (precision === undefined) {
                    precision = this.precisionForDecimal;
                }
                return value.toFixed(precision);
            },

            /**
             * Format a date using a number
             *
             * @param value         The date in milliseconds since the epoch.
             * @param dateFormat    The date format to use
             * @returns {String}    The formatted value
             */
            formatDateFromNumber: function (value, dateFormat) {

                var
                    result;

                if (mx.parser.formatValue) {
                    result = mx.parser.formatValue(new Date(value), "datetime", { datePattern: dateFormat});
                } else {
                    result = dojoDateLocale.format(new Date(value), { selector : "date", datePattern: dateFormat});
                }

                return result;
            },

            /**
             * Cleanup upon destruction of the widget instance.
             *
             */
            uninitialize: function () {
                // console.log(this.domNode.id + ": uninitialize");
                if (this.handle) {
                    mx.data.unsubscribe(this.handle);
                }
                if (this.progressDialogId) {
                    this.hideProgress();
                }
            }
        });
    });

}());
