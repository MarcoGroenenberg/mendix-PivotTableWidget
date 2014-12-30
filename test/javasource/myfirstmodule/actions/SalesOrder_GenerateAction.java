// This file was generated by Mendix Business Modeler.
//
// WARNING: Only the following code will be retained when actions are regenerated:
// - the import list
// - the code between BEGIN USER CODE and END USER CODE
// - the code between BEGIN EXTRA CODE and END EXTRA CODE
// Other code you write will be lost the next time you deploy the project.
// Special characters, e.g., é, ö, à, etc. are supported in comments.

package myfirstmodule.actions;

import java.util.Calendar;
import java.util.List;
import myfirstmodule.proxies.Employee;
import myfirstmodule.proxies.Region;
import myfirstmodule.proxies.SalesOrder;
import com.mendix.systemwideinterfaces.core.IContext;
import com.mendix.webui.CustomJavaAction;

/**
 * 
 */
public class SalesOrder_GenerateAction extends CustomJavaAction<Boolean>
{
	public SalesOrder_GenerateAction(IContext context)
	{
		super(context);
	}

	@Override
	public Boolean executeAction() throws Exception
	{
		// BEGIN USER CODE
		
		List<Employee> employeeList = Employee.load(getContext(), "");
		
		for (int month = 0; month < 12; month++) {
			for (Region region : Region.values()) {
				for (Employee employee : employeeList) {
					long maxCount = Math.round(Math.random() * 5) + 1;
					for (int i = 1; i < maxCount; i++) {
						Long day = Math.round(Math.random() * 20) + 1;
						calendar.set(2013, month, day.intValue());
						
						SalesOrder salesOrder = new SalesOrder(getContext());
						salesOrder.setorderDate(calendar.getTime());
						salesOrder.setregion(region);
						salesOrder.setSalesOrder_Employee(employee);
						String totalSalesValueString = day.toString() + month + "00";
						Double totalSalesValue = Double.parseDouble(totalSalesValueString);
						salesOrder.settotalSalesValue(totalSalesValue);
						int itemCount = day.intValue() * (month + 1);
						salesOrder.setitemCount(itemCount);
						salesOrder.commit();
					}
				}
			}
		}
		
		return true;
		// END USER CODE
	}

	/**
	 * Returns a string representation of this action
	 */
	@Override
	public String toString()
	{
		return "SalesOrder_GenerateAction";
	}

	// BEGIN EXTRA CODE
	private Calendar calendar = Calendar.getInstance();
	// END EXTRA CODE
}