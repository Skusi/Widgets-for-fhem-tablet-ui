/* FHEM tablet ui */
/**
* Just another dashboard for FHEM
*
* Version: 1.4.2
* Requires: jQuery v1.7+, font-awesome, jquery.gridster, jquery.toast
*
* Copyright (c) 2015 Mario Stephan <mstephan@shared-files.de>
* Under MIT License (http://www.opensource.org/licenses/mit-license.php)
*
*/
var deviceStates={};
var readings = {"STATE":true};
var devices = {};
var types = {};
var DEBUG = false;
var TOAST = true;
var doLongPoll = false
var timer;
var timeoutMenu;
var dir = '';
var filename = '';
var shortpollInterval = 30 * 1000; // 30 seconds
var devs=Array();
var pars=Array();
var gridster;
var styleCollection={};

var plugins = {
  modules: [],
  addModule: function (module) {
    this.modules.push(module);
  },
  load: function (name) {
  	loadplugin(name, function () { 
		DEBUG && console.log('Loaded plugin: '+ name);
		var module = eval(name);
		plugins.addModule(module);
        module.init();
        ////update all what we have until now
        //for (var reading in readings) {
        //    for (var device in devices) {
        //        module.update(device,reading);
        //    }
        //}
        ////request missing readings
        //for (var reading in readings) {
        //    if (pars.indexOf(reading)<0){
        //        pars.push(reading);
        //        requestFhem(reading);
        //    }
        //}

    },null,true);
  },
  update: function (dev,par) {  
    $.each(this.modules, function (index, module) {
      //Iterate each module and run update function
      module.update(dev,par);
    });
    DEBUG && console.log('update done for device:'+dev+' parameter:'+par);
  }
}


// event page is loaded
$(document).on('ready', function() {

    //add background for modal dialogs
    $("<div id='shade' />").prependTo('body').hide();
	
    loadStyleSchema();
    initPage();

    if ( doLongPoll ){
        setTimeout(function() {
                longPoll();
        }, 1000);
        shortpollInterval = 15 * 60 * 1000; // 15 minutes
    }

    $("*:not(select)").focus(function(){
        $(this).blur();
    });

    // refresh every x secs
    startPollInterval();
});

function initPage() {

    wx = parseInt( $("meta[name='widget_base_width']").attr("content") );
    wy = parseInt( $("meta[name='widget_base_height']").attr("content") );
	doLongPoll = ($("meta[name='longpoll']").attr("content") == '1');
	DEBUG  = ($("meta[name='debug']").attr("content") == '1');
    TOAST  = ($("meta[name='toast']").attr("content") != '0');
	
	//self path
	dir = $('script[src$="fhem-tablet-ui.js"]').attr('src');
	var name = dir.split('/').pop(); 
	dir = dir.replace('/'+name,"");
	DEBUG && console.log('Plugin dir: '+dir);

    var url = window.location.pathname;
    filename = url.substring(url.lastIndexOf('/')+1);
    DEBUG && console.log('Filename: '+filename);

    //init gridster
    if (gridster)
        gridster.destroy();
        gridster = $(".gridster > ul").gridster({
          widget_base_dimensions: [wx, wy],
          widget_margins: [5, 5],
          draggable: {
            handle: 'header'
          }
        }).data('gridster');
        if($("meta[name='gridster_disable']").attr("content") == '1') {
            gridster.disable();
        }
	
    //include extern html code
    var total = $('[data-template]').length;
    if (total>0){
        $('[data-template]').each(function(index) {
            $(this).load($(this).data('template'), function() {
                if (index === total - 1) {
                    //continue after loading the includes
                    initWidgets();
                }
            });
        });
    }
    else{
       //continue immediately with initWidgets
       initWidgets();
    }

}

function initWidgets() {

    showDeprecationMsg();

    //collect required widgets types
    $('div[data-type]').each(function(index){
        var t = $(this).data("type");
        if(!types[t])
            types[t] = true;
    });

    //collect required devices
    $('div[data-device]').each(function(index){
        var device = $(this).data("device");
        if(!devices[device]){
            devices[device] = true;
            devs.push(device);
        }
    });

    //collect required readings
    DEBUG && console.log('Collecting required readings');
    $('[data-get]').each(function(index){
        var reading = $(this).data("get");
        if(!readings[reading]){
            readings[reading] = true;
            pars.push(reading);
        }
    });

    //init widgets
    for (var widget_type in types) {
        plugins.load('widget_'+widget_type);
    }

    //get current values of readings
    DEBUG && console.log('Request readings from FHEM');
    //for (var reading in readings) {
    //    requestFhem(reading);
    //}
    requestFhem();
}

function showDeprecationMsg() {

    //make it HTML conform (remove this after migration)
    $('div[type]').each(function() {
        $(this).attr({
            'data-type' : $(this).attr('type'),
        })
        .removeAttr('type');
        console.log('Please rename widget attribute "type" into "data-type" in ' + document.location + ($(this).attr('data-device')?' device: '+$(this).attr('data-device'):'') + ' - Details below:');
        console.log($(this));
    });
    $('div[device]').each(function() {
        $(this).attr({
            'data-device' : $(this).attr('device'),
        })
        .removeAttr('device');
        console.log('Please rename widget attribute "device" into "data-device" in ' + document.location + ($(this).attr('data-device')?' device: '+$(this).attr('data-device'):'') + ' - Details below:');
        console.log($(this));
    });
    $('div[data-type="contact"]').each(function() {
        $(this).attr({'data-type' : 'symbol',})
        console.log('Please rename widget "contact" into "symbol" in ' + document.location + ($(this).attr('data-device')?' device: '+$(this).attr('data-device'):'') + ' - Details below:');
        console.log($(this));
    });
    //end **** (remove this after migration)
}

function startPollInterval() {
     clearInterval(timer);
     timer = setInterval(function () {
		//get current values of readings every x seconds
		//for (var reading in readings) {
		//	requestFhem(reading);
        //}
        requestFhem();
     }, shortpollInterval); 
 }

function setFhemStatus(cmdline) {
    startPollInterval();
    DEBUG && console.log('send to FHEM: '+cmdline);
	$.ajax({
		async: true,
		url: $("meta[name='fhemweb_url']").attr("content") || "/fhem/",
		data: {
			cmd: cmdline,
			XHR: "1"
		}
	})
	.fail (function(jqXHR, textStatus, errorThrown) {
    		$.toast("Error: " + textStatus + ": " + errorThrown);
	})
  	.done ( function( data ) {
  		if ( !doLongPoll ){
			setTimeout(function(){
				//for (var reading in readings) {
				//	requestFhem(reading);
				//}
				requestFhem();
			}, 4000);
		}
	});
}

var xhr;
var currLine=0;
function longPoll(roomName) {
/* try to avoid this terrible fmt=JSON output format 
	- no separat node for parameter name
	- multiple nodes with the same data (2xdate)
*/
	DEBUG && console.log('start longpoll');
	
	if (xhr)
		xhr.abort();
	currLine=0;
	
	$.ajax({
		url: $("meta[name='fhemweb_url']").attr("content") || "/fhem/",
		cache: false,
		complete: function() {
			setTimeout(function() {
                longPoll();
			}, 100);
		},
		timeout: 60000,
		async: true,
		data: {
			XHR:1,
			inform: "type=raw;filter=.*"
		},
		xhr: function() {
			xhr = new window.XMLHttpRequest();
			xhr.addEventListener("readystatechange", function(e){
				var data = e.target.responseText;
		  		if ( e.target.readyState == 4) {
    				return;
  				}
				if ( e.target.readyState == 3 )
				{
					var lines = data.replace(/<br>/g,"").split(/\n/);
                    var regDevice = /\s[0-2][0-9]:[0-5][0-9]:[0-5][0-9]\.?[0-9]{0,3}\s(\S*)\s(\S*)\s(.*)/;
                    var regDate = /^([0-9]{4}-[0-9]{2}-[0-9]{2}\s[0-2][0-9]:[0-5][0-9]:[0-5][0-9])\.?[0-9]{0,3}\s/;
					var regParaname = /^(\S{3,}):(?:\s(.*))?$/;
					lines.pop(); //remove last empty line
					
					for (var i=currLine; i < lines.length; i++) {
						var date;
                        //date = ..... new Date(); //do we need this?
						var line = $.trim( lines[i] );
                        //console.log('#'+line+'#');
						
						if ( regDate.test( line ))
							date = $.trim(line.match( regDate )[1]);
						if ( regDevice.test( line )) {
							//Bad parse hack, but the JSON is not well formed
							var room = $.trim( line.match( regDevice )[1] );
							var key = $.trim( line.match( regDevice )[2] );
							var parname_val = $.trim(line.match( regDevice )[3]);
							var params = deviceStates[key] || {};
							var paraname;
							var val;
							if ( regParaname.test(parname_val) ){
								var paraname = $.trim(parname_val.match( regParaname )[1]);
								var val = $.trim(parname_val.match( regParaname )[2]);
							}
							else {
								var paraname = 'STATE';
								var val = parname_val;
							}
							if ( (paraname in readings) && (key in devices) ){
								var value = {"date": date,
											  "room": room,
												"val": val
											};
								params[paraname]=value;
								deviceStates[key]=params;
								DEBUG && console.log(date + ' / ' + key+' / '+paraname+' / '+val);
                                plugins.update(key,paraname);
							}
							//console.log(date + ' / ' + key+' / '+paraname+' / '+val);
						}
					}
					currLine = lines.length;
				}
 
    		}, false);
			return xhr;
			}
	});
}
            
//function requestFhem(paraname) {
///* 'list' is still the fastest cmd to get all important data
//*/
//    $.ajax({
//        async: true,
//        timeout: 15000,
//		cache: false,
//		context:{paraname: paraname},
//		url: $("meta[name='fhemweb_url']").attr("content") || "/fhem/",
//		data: {
//            cmd: "list " + $.map(devs, $.trim).join() + " " + paraname,
//			XHR: "1"
//		}
//	})
//	.fail (function(jqXHR, textStatus, errorThrown) {
//    		$.toast("Error: " + textStatus + ": " + errorThrown);
//  	})
//  	.done (function( data ) {
//			var lines = data.replace(/\n\)/g,")\n").split(/\n/);
//            var regCapture = /^(\S*)\s*([0-9]{4}-[0-9]{2}-[0-9]{2}\s[0-2][0-9]:[0-5][0-9]:[0-5][0-9])?\.?[0-9]{0,3}\s+(.*)$/;
//            for (var i=0; i < lines.length; i++) {
//                var date,key,val;
//                var line = $.trim( lines[i] );
//                //console.log('line: '+line);
//                if (regCapture.test(line) ) {
//                    var groups = line.match( regCapture );
//                    var paraname = this.paraname;
//                    key = $.trim( line.match( regCapture )[1]);
//                    if (groups.length>2){
//                        date = $.trim( groups[2]);
//                        val = $.trim( groups[3]);
//                    }
//                    //console.log('paraname',paraname,'date:',date,'val',val);
//                    var params = deviceStates[key] || {};
//                    var value = {"date": date, "val": val};
//                    params[paraname]=value;
//                    if (key in devices){
//                        deviceStates[key]=params;
//                        plugins.update(key,paraname);
//                    }
//                }
//            }
//    });
//
//}

var r_start;
var r_last;
var r_done;

function benchmsg(message) {
    r_now = new Date().getTime();
    // r_now - r_last is the time between benchmsg's
    console.log('['+r_now+'] requestFhem: ' + message + ' after ' + (r_now - r_start) + 'ms (' + (r_now - r_last) + 'ms)');
    r_last = r_now;
}

function requestFhem() {
    r_start = new Date().getTime();

    // only for benchmarking
    $.ajax({
        async: true,
        timeout: 15000,
        cache: false,
        url: $("meta[name='fhemweb_url']").attr("content") || "../fhem/",
        data: {
            cmd: "list " + devs.join() + " STATE",
            XHR: "1"
        }
    }).done (function( data ) {
        benchmsg('* ajax list STATE');
    });

	$.ajax({
		async: true,
        timeout: 15000,
		cache: false,
		url: $("meta[name='fhemweb_url']").attr("content") || "../fhem/",
		data: {
			cmd: "jsonlist2 " + devs.join(),
			XHR: "1"
		}
	})
	.fail (function(jqXHR, textStatus, errorThrown) {
    		$.toast("Error: " + textStatus + ": " + errorThrown);
  	})
  	.done (function( data ) {
            benchmsg('* ajax jsonlist2');
            var response = JSON.parse(data);
            benchmsg('json parse');
            
            // check which readings, internals and attrs are subscribed to
            var subscr = {
                state : true,
                readings : false,
                internals : false,
                attr : false
            };
            var subscriptions = Object.keys(readings);
            for(var s=0;s<subscriptions.length;s++) {
                if(subscriptions[s].substr(0,1)=='+') {
                    susbcr.internals = true;
                } else if(subscriptions[s].substr(0,1)=='?') {
                    subscr.attr = true;
                } else {
                    subscr.readings = true;
                }
                if(subscr.state && subscr.readings && subscr.internals && subscr.attr) {
                    break;
                }
            }
            benchmsg('subscriptions checked');
            
            for(var r=0;r<response.Results.length;r++) {
                var key = response.Results[r].Name;
                
                if(subscr.state) {
                    var state = response.Results[r].Internals.STATE;
                    if(state) {
                        var params = deviceStates[key] || {};
			            var value = { "val": state};
			            params['STATE']=value;
                        if (key in devices){
			            	deviceStates[key]=params;
                            plugins.update(key,'STATE');
                        }
                    }
                    //benchmsg('    STATE ' + key + ' read');
                }
                
                if(subscr.internals) {
                    var internals = Object.keys(response.Results[r].Internals);
                    for(var i=0;i<internals.length;i++) {
                        var paraname = '+'+internals[i];
                        if(readings[paraname]) {
                            var val = response.Results[r].Internals[internals[i]];
                            var params = deviceStates[key] || {};
			                params[paraname]={"val": val};
                            if (key in devices){
			                	deviceStates[key]=params;
                                plugins.update(key,paraname);
                            }
                        }
                    }
                    //benchmsg('    internals ' + key + ' read');
                }
                
                if(subscr.attr) {
                    var attributes = Object.keys(response.Results[r].Attributes);
                    for(var a=0;a<attributes.length;a++) {
                        var paraname = '?'+attributes[a];
                        if(readings[paraname]) {
                            var val = response.Results[r].Attributes[attributes[a]];
                            var params = deviceStates[key] || {};
			                params[paraname]={"val": val};
                            if (key in devices){
			                	deviceStates[key]=params;
                                plugins.update(key,paraname);
                            }
                        }
                    }
                    //benchmsg('    attr ' + key + ' read');
                }
                
                if(subscr.readings) {
                    var r_readings = Object.keys(response.Results[r].Readings);
                    for(var read=0;read<r_readings.length;read++) {
                        var paraname = r_readings[read];
                        if(readings[paraname]) {
                            var val = response.Results[r].Readings[paraname].Value;
                            var date = response.Results[r].Readings[paraname].Time;
                            
                            var params = deviceStates[key] || {};
			                var value = {"date": date, "val": val};
			                params[paraname]=value;
                            if (key in devices){
			                	deviceStates[key]=params;
                                plugins.update(key,paraname);
                            }
                        }
                    }
                    //benchmsg('    readings ' + key + ' read');
                }
                //benchmsg(key + ' done');
            }
            r_done = new Date().getTime();
            benchmsg('all done');
	});
}

function loadplugin(plugin, success, error, async) {
    dynamicload('js/'+plugin+'.js', success, error, async);
}

function dynamicload(file, success, error, async) {
    var dir = $('script[src$="fhem-tablet-ui.js"]').attr('src');
    var name = dir.split('/').pop(); 
    dir = dir.replace('/'+name,"");
    $.ajax({
        url: dir + '/../' + file,
        dataType: "script",
        cache: true,
        async: async || false,
        context:{name: name},
        success: success||function(){ return true },
        error: error||function(){ return false },
    });
}

function loadStyleSchema(){
    $.each($('link[href$="-ui.css"]') , function (index, thisSheet) {
        var rules = thisSheet.sheet.cssRules;
        for (var r in rules){
            if (rules[r].style){
               var styles = rules[r].style.cssText.split(';');
               styles.pop();
               var elmName = rules[r].selectorText;
               var params = {};
               for (var s in styles){
                   var param = styles[s].split(':');
                   if (param[0].match(/color/)){
                      params[$.trim(param[0])]=$.trim(param[1]);
                   }
               }
               if (Object.keys(params).length>0)
                    styleCollection[elmName]=params;
            }
        }
    });
}

this.getPart = function (s,p) {
	if ($.isNumeric(p)){
		var c = (s && typeof s != "undefined") ? s.split(" ") : '';
		return (c.length >= p && p>0 ) ? c[p-1] : s;
	}
	else {
		if ((s && typeof s != "undefined") )
			var matches = s.match( RegExp('^' + p + '$') );
		var ret='';
		if (matches) {
			for (var i=1;i<matches.length;i++) {
				ret+=matches[i];
			}
		}
		return ret;
	}
};

this.getDeviceValue = function (device, src) {
    var param = getParameter(device, src);
    return ( param ) ? param.val : null;
}

this.getReadingDate = function (device, src) {
    var param = getParameter(device, src);
    return ( param ) ? param.date : null;
}

this.getParameter = function (device, src) {
    var devname	= device.data('device');
    var paraname =	(src && src != '') ? device.data(src) : Object.keys(readings)[0];
    if (devname && devname.length>0){
        var params = deviceStates[devname];
        return ( params && params[paraname] ) ? params[paraname] : null;
    }
    return null;
}

this.getStyle = function (selector, prop) {
    var props = styleCollection[selector];
    return ( props && props[prop] ) ? props[prop] : null;
}

// global helper functions
this.showModal = function (modal) {
    if(modal)
        $("#shade").fadeIn();
    else
       $("#shade").fadeOut();
}

// global date format functions
this.dateFromString = function (str) {
 var m = str.match(/(\d+)-(\d+)-(\d+)_(\d+):(\d+):(\d+).*/);
 return (m)?new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]):new Date();
}

this.diffMinutes = function(date1,date2){
       var end   = dateFromString(date2),
       start   = dateFromString(date1),
       diff  = new Date(end - start);
       return (diff/1000/60).toFixed(0);
}
   
Date.prototype.yyyymmdd = function() {
  var yyyy = this.getFullYear().toString();
  var mm = (this.getMonth()+1).toString(); // getMonth() is zero-based
  var dd  = this.getDate().toString();
  return yyyy+'-'+ (mm[1]?mm:"0"+mm[0])+'-'+(dd[1]?dd:"0"+dd[0]); // padding
 };

Date.prototype.hhmmss = function() {
  var hh = this.getHours().toString();
  var mm = this.getMinutes().toString();
  var ss  = this.getSeconds().toString();
  return (hh[1]?hh:"0"+hh[0])+':'+ (mm[1]?mm:"0"+mm[0])+':'+(ss[1]?ss:"0"+ss[0]); // padding
 };
 
Date.prototype.mmdd = function() {
  var mm = (this.getMonth()+1).toString(); // getMonth() is zero-based
  var dd  = this.getDate().toString();
  return (mm[1]?mm:"0"+mm[0])+'-'+(dd[1]?dd:"0"+dd[0]); // padding
 };

//sadly it not possible to use Array.prototype. here
this.indexOfGeneric = function(array,find){
  for (var i=0;i<array.length;i++) {
    if (!$.isNumeric(array[i]))
        return indexOfRegex(array,find);
  }
  return indexOfNumeric(array,find);
};

this.indexOfNumeric = function(array,val){
   var ret=-1;
   for (var i=0;i<array.length;i++) {
       if (Number(val)>=Number(array[i]))
           ret=i;
   }
   return ret;
};

this.indexOfRegex = function(array,find){
  for (var i=0;i<array.length;i++) {
      var match = find.match(new RegExp(array[i]));
      if (match)
            return i
  }
  return array.indexOf(find);
};