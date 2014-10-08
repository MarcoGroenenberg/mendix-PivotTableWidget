mendix-PivotTableWidget
=======================

Mendix Pivot Table Widget

 

##Description
This widget calls a microflow to get a list of entity objects and creates a pivot table using the list.

The context the widget is placed in is passed on to the the microflow. This allows the application to present a selection screen and pass those selections to the microflow that creates the list.

 

The values to group the data on and the labels for the X and Y axis are taken from the entity objects.

 

The pivot table widget can count the items in each cell or determine the sum, average, minimum or maximum value in each cell.

For count and sum, optionally a total column and row can be displayed.

 

The various elements in the table can easily be styled.

It is also possible to set thresholds that apply a CSS class depending on the cell value.

 

The pivot table widget can call a microflow when the user clicks on a cell.

 

Have a look at the screen shots or download the Pivot Table Demo Project

##Typical Usage Scenario

- Count incidents for carriers and categories, highlight areas with many incidents.
- Average or total sales value per month and region, highlight areas with low and high values.

##Features And Limitations

- Widget calls a microflow to retrieve the data.
- Microflow receives the context the widget was placed in.
- Values and labels for the X and Y axis are attributes of the entity.
- Perform actions on the data in each cell.
- React to click events on the cells.
- React to changes (commits) of the context object.
- Apply styling thresholds to highlight certain values
- Non-persistent entities are supported and actually preferred.
- When the microflow returns an empty list no table will be rendered but a (configurable) text will be shown.
- Only basic attributes are supported, no references. This is done to minimize the number of server roundtrips and keep the widget design as simple as possible.
- It is not possible to call a microflow with simple types as parameters so another entity is necessary to pass the selection to the microflow when the user clicks on a cell.
- Float is not currently supported.

##Installation

Normal installation using the App Store

##Dependencies
 
- Mendix 5.1.1 Environment

##Configuration

###Non-persistent entities
The pivot table widget can use any entity as the data object. However, it is advised to use non-persistent entities for this widget for a number of reasons:

- To minimize server roundtrips and keep the widget design simple, only direct attributes of the entity can be used, no references.
- The labels for the X and Y axis are also taken from the object list.
 

When dealing with very large datasets, performance can become a problem. In that case, the microflow can already aggregate the data. An example: For the total sales value, the microflow returns one object for each combination of month and region, containing the total sales value for that combination. The pivot table widget still performs a sum action on the data, to create the total column and row values. This way, tens of thousands of records can be put in the pivot table with acceptable response.

##Step by step
The typical flow when using this widget:

1. Show a page containing a Data view of the (non-persistent) selection criteria entity.
1. The user can enter the selection criteria
1. A microflow button shows another page containing the pivot table widget
1. The pivot table widget calls the microflow to get the data and displays the table.


The selection criteria and the pivot table widget can be on the same page to allow the user to change the criteria and see the result without page navigation.

##Properties
###Configuration, X-axis and Y-axis categories

The first part is the configuration of the entity and its attributes. The entity must match the return value of the microflow. For the axis grouping and label values, numbers and strings are supported but also dates and enums. For dates a date format can be specified. For enums the caption will be shown as label.

No cell value attribute is necessary when objects are to be counted. Currency, integer and long can be used on any action, DateTime only for Min and Max.

When calculating an average of integer or long values, a decimal precision can be set. This does not apply for currency.

By default the X and Y axis values are sorted ascending on their display values. It is also possible to sort on the ID attribute and specify descending sort.

The pivot table widget can display an additional column and row for the totals, only for actions Count and Sum.

###React to context object updates.

The pivot table widget can call the microflow in these situations:

- At widget creation (default)
- After the context object is committed, can be used to allow the user to specify criteria before building the table.
- Both of the above.

###Styling category

All parts of the pivot table widget can be styled. Each class property has a default. There are two row classes to allow for an alternating background color. This makes large tables much easier to read.

Cell values are centered by default. There are other CSS classes available in the pivot table widget CSS that allow left or right adjustment. This applies to:

- X-axis label class
- Cell class
- Total column cell class
- Total row cell class

Caption | Default value | Description
---------- | ---------- | ----------
X-axis label class | PivotDataWidgetXLabelCenter | X-axis label CSS class.
Y-axis label class | PivotDataWidgetYLabel | Y-axis label CSS class.
Odd row class | PivotDataWidgetOddRow | Odd row CSS class.
Even row class | PivotDataWidgetEvenRow | Even row CSS class.
Cell class | PivotDataWidgetCellCenter | Cell CSS class.
Total column cell class | PivotDataWidgetTotalColumnCellCenter | Cell CSS class.
Total row class | PivotDataWidgetTotalRow | Cell CSS class.
Total row cell class | PivotDataWidgetTotalRowCellCenter | Cell CSS class.
No data text class | PivotDataWidgetNoDataText | No data text CSS class.
On cell click class | PivotDataWidgetCellClickable | On cell click CSS class. This is an additional class applied to each table cell when the on cell click microflow is configured

###Styling thresholds

To highlight certain values, styling thresholds can be defined. When the cell value is at least the threshold value and less than any next threshold value, the CSS class will be applied to the cell. Only the CSS class of the highest threshold will be used.

####Configuration onCellClick category

Unfortunately, it is not possible to call a microflow with simple parameters, like strings or integers.

To handle cell click events, the pivot table widget creates an object of the entity specified in the properties, sets the X and Y values of the cell on it and then calls the microflow.
When you create an association from the on click entity to the context entity, you can select that relation. The widget will then set that reference on the object. The microflow has then direct access to the context object of the widget. 


**It is strongly advised to use a non-persistent entity for this purpose!**

##Known Bugs
 

None
 

##Frequently Asked Questions
 

Ask your question at the Mendix Community Forum
 