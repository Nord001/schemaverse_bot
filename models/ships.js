
var client = undefined;

var max = 500;
var MAX_HEALTH = 1000;
var MAX_FUEL = 200000;
var MAX_SPEED = 800000;
var RANGE = 5000;

var upgrade_cost = 2375;

exports.get_conquerers_count = function(callback){
	client.query(
		"SELECT COUNT(my_ships.id) count \
		FROM my_ships \
			LEFT JOIN planets ON ((planets.location <-> my_ships.Location) < 10) \
		WHERE my_ships.name = 'attacker' AND planets.id is NULL;",
		function(err, result){
	        if (!err){
	            callback(result.rows[0].count);
	        } else {
	            throw err;
	        }                      
    	}
    );
}

exports.setClient = function(c) {
	client = c;
}

var mine = function(ship, planet, callback){
	set_long_action('MINE', ship, planet, callback);
}

var set_long_action = function(action, who, whom, success){
	client.query(
		"UPDATE my_ships SET action = $1, action_target_id = $2 WHERE id = $3;",
		[action, whom, who],
		function(){
			if(typeof(success) == "function"){
    			success();
    		}
		}
	);
}

var get_damaged_in_travel = function(callback){
	client.query(
		"SELECT damaged.id id\
		FROM my_ships damaged\
		LEFT JOIN planets ON ((damaged.Location <-> planets.location) < 10)\
		WHERE\
			damaged.current_health < damaged.max_health AND\
			planets.id is NULL AND\
			action is NULL;", 
		function(err, result){
	        if (!err){
	        	if(result.rowCount > 0){
	        		 callback(result.rows[0].id);
	        	}
	        } else {
	            throw err;
	        }                      
   		}
   	);
}

var get_damaged = function(planet, callback){
	client.query(
		"SELECT *\
		FROM my_ships damaged\
		WHERE\
			damaged.current_health < damaged.max_health AND\
			(damaged.Location <-> $1) < 10 AND\
			(SELECT COUNT(engineers.id) FROM my_ships engineers WHERE engineers.action = 'REPAIR' AND engineers.action_target_id = damaged.id) = 0;", 
		[planet.location],
		function(err, result){
	        if (!err){
	            callback(result.rows);
	        } else {
	            throw err;
	        }                      
   		}
   	);
}

var get_engineer = function(planet, callback){
	client.query(
		"SELECT * FROM my_ships WHERE name = 'engineer' AND action is NULL AND (my_ships.Location <-> $1) < 10 LIMIT 1;",
		[planet.location],
		function(err, result){
			if(result.rows.length > 0){
				callback(result.rows[0].id);
			}else{
				client.query(
					"INSERT INTO my_ships(name, attack, defense, engineering, prospecting , location) values ('engineer',0,0,20,0,$1) RETURNING id;",
					[planet.location],
					function(err, result){
				        if (err){
				            throw err;
				        }else{
				        	if(result.rowCount > 0){
				        		callback(result.rows[0].id);
				        	}else{
				        		console.log('Engineer not created');
				        		if(typeof(callback) == "function"){
				        			callback();
				        		}
				        	}
				        }                 
			    	}
			    );
			}
		}
	);
}

var autorepair = function(damaged, success){
	set_long_action(
		'REPAIR',
		damaged,
		damaged,
		success
	);
}

var repair = function(damaged, planet, success){	
	get_engineer(planet, function(engineer){
		set_long_action(
			'REPAIR',
			engineer,
			damaged,
			success
		);
	});
}

exports.get_attackers_count = function(planet, callback){
	client.query(
		"SELECT COUNT(id) count FROM my_ships WHERE name = 'attacker' AND (my_ships.Location <-> $1) < 10;",
		[planet.location],
		function(err, result){
	        if (!err){
	            callback(result.rows[0].count);
	        } else {
	            throw err;
	        }                      
    	}
    );
}

exports.repair = repair;

exports.get_mining_count = function(planet, callback){
	client.query(
		"SELECT COUNT(id) count FROM my_ships WHERE action = 'MINE' AND (my_ships.Location <-> $1) < 10;",
		[planet.location],
		function(err, result){
	        if (!err){
	            callback(result.rows[0].count);
	        } else {
	            throw err;
	        }                      
    	}
    );
}

exports.create_miner = function(planet, success, error){
	client.query(
		"INSERT INTO my_ships(name, attack, defense, engineering, prospecting , location) values ('miner',0,0,0,20,$1) RETURNING id;",
		[planet.location],
		function(err, result){
	        if (err){
	            throw err;
	        }else{
	        	if(result.rowCount > 0){
	        		mine(result.rows[0].id, planet.id, success);
	        	}else{
	        		if(typeof(error) == "function"){
	        			console.log('Miner not created');
	        			error();
	        		}
	        	}
	        }                 
    	}
    );
}

exports.upgrade_ship = function(success){
	client.query(
		"SELECT id, name, max_health, max_fuel, max_speed, range, attack, defense, engineering, prospecting FROM my_ships\
		WHERE\
			max_health < $1 OR max_fuel < $2 OR max_speed < $3 OR range < $4 OR (attack + defense + engineering + prospecting)< $5\
		ORDER BY range asc\
		LIMIT 1;",
		[MAX_HEALTH, MAX_FUEL, MAX_SPEED, RANGE, max],
		function(err, result){
			if (err){
	            throw err;
	        }else{
	        	if(result.rowCount > 0){

	        		var skills = {
	        			PROSPECTING: 1,
	        			ENGINEERING: 1,
	        			ATTACK: 1,
	        			DEFENSE: 1
	        		}

	        		if(result.rows[0].name == 'miner'){
	        			skills.PROSPECTING = 5;
	        		}else if(result.rows[0].name == 'engineer'){
	        			skills.ENGINEERING = 5;
	        		}else if(result.rows[0].name == 'attacker'){
	        			skills.ATTACK = 5;
	        		}else{
	        			skills.DEFENSE = 5;
	        		}

	        		client.query(
	        			"SELECT id,\
						   UPGRADE(id, 'MAX_HEALTH', 2), \
						   UPGRADE(id, 'MAX_FUEL', 400), \
						   UPGRADE(id, 'MAX_SPEED', 1600), \
						   UPGRADE(id, 'RANGE', 10), \
						   UPGRADE(id, 'PROSPECTING', $2),\
						   UPGRADE(id, 'ENGINEERING', $3),\
						   UPGRADE(id, 'ATTACK', $4),\
						   UPGRADE(id, 'DEFENSE', $5)\
						 FROM my_ships \
						 WHERE id=$1;",
						[result.rows[0].id, skills.PROSPECTING, skills.ENGINEERING, skills.ATTACK, skills.DEFENSE],
						function(err, res){
							if (err){
								if(err != 'error: deadlock detected'){
									throw err;
								}else{
									success();
								}
					        }else{
					        	success();
					        }
						}
					);
	        	}else{
	        		success();
	        	}
	        }     
		}
	);
}

exports.get_damaged = get_damaged;

exports.create_attacker = function(planet, success, error){
	client.query(
		"INSERT INTO my_ships(name, attack, defense, engineering, prospecting , location) values ('attacker',20,0,0,0,$1) RETURNING id;",
		[planet.location],
		function(err, result){
	        if (err){
	            throw err;
	        }else{
	        	if(result.rowCount > 0){
	        		if(typeof(success) == "function"){
	        			success();
	        		}
	        	}else{
	        		if(typeof(error) == "function"){
	        			console.log('Attacker not created');
	        			error();
	        		}
	        	}
	        }                 
    	}
    );
}

exports.reject_long_action = function(action, who, whom, success){

	var params = [];
	if(who){
		params.push(who);
	}
	if(whom){
		params.push(whom);
	}
	if(action){
		params.push(action);
	}

	client.query(
		"UPDATE my_ships SET action = NULL WHERE True"+
		(who?' AND id = $'+(params.indexOf(who)+1):'')+
		(whom?' AND action_target_id = $'+(params.indexOf(whom)+1):'')+
		(action?' AND action = $'+(params.indexOf(action)+1):'')+";",
		params,
		function(err, result){
			if (err){
				if(err != 'error: deadlock detected'){
	            	throw err;
	        	}else{
	        		success();
	        	}
		    }else{
				if(typeof(success) == "function"){
	    			success();
	    		}
	    	}
		}
	);
}

exports.get_fuel_empty_ship = function(callback){
	client.query(
		"SELECT *\
		FROM my_ships\
		WHERE current_fuel < max_fuel;", 
		function(err, result){
	        if (!err){
	        	if(result.rowCount > 0){
	        		callback(result.rows[0].id);
	        	}else{
	        		callback(undefined);
	        	}
	        } else {
	            throw err;
	        }                      
   		}
   	);
}

exports.refuel = function(ship, callback){
	client.query(
		"SELECT refuel_ship($1) status;", 
		[ship],
		function(err, result){
	        if (!err){
	        	if(typeof(callback) == 'function'){
	        		callback(result.rows[0].status);
	        	}
	        } else {
	        	if(err != 'error: deadlock detected'){
	            	throw err;
	        	}else{
	        		callback();
	        	}
	        }                      
   		}
   	);
}

exports.get_enemy_ship_in_range = function(callback){
	client.query(
		"SELECT ships_in_range.id id, ships_in_range.ship_in_range_of ship_in_range_of\
		FROM ships_in_range, my_ships\
		WHERE my_ships.id = ships_in_range.ship_in_range_of AND my_ships.name = 'attacker' AND (my_ships.action <> 'ATTACK' OR my_ships.action is NULL);", 
		function(err, result){
	        if (!err){
	        	if(result.rowCount > 0){
	        		if(typeof(callback) == 'function'){
		        		callback(result.rows[0].ship_in_range_of, result.rows[0].id);
		        	}
	        	}
	        } else {
	        	if(err != 'error: canceling statement due to user request'){
	        		throw err;
	        	}
	        }                      
   		}
   	);
}

exports.get_enemy_planet_in_range = function(callback){
	client.query(
		"SELECT DISTINCT ON (planets_in_range.planet) planets_in_range.planet id, planets_in_range.ship ship\
		FROM planets_in_range, my_ships, planets planet\
		WHERE\
			planet.id = planets_in_range.planet AND\
			my_ships.id = planets_in_range.ship AND\
			my_ships.name = 'attacker' AND\
			my_ships.action is NULL AND \
			planet.conqueror_id <> get_player_id(SESSION_USER);", 
		function(err, result){
	        if (!err){
	        	if(result.rowCount > 0){
	        		if(typeof(callback) == 'function'){
		        		callback(result.rows[0].ship, result.rows[0].id);
		        	}
	        	}
	        } else {
	            throw err;
	        }                      
   		}
   	);
}

exports.attack = function(who, whom, callback){
	set_long_action(
		'ATTACK',
		who,
		whom,
		callback
	);
}

exports.send_attackers = function(location, from, count){
	client.query(
		"SELECT\
			(ship.location <-> $1) dist, ship.id, SHIP_COURSE_CONTROL(ship.id,(ship.location <->$1)::integer,null,$1)\
		FROM my_ships ship \
		WHERE ship.name = 'attacker' AND (ship.location <-> $2) < 10\
		LIMIT $3",
		[location, from, count],
		function(err, result){
	        if (err) {
	            throw err;
	        }                      
   		}
   	);
}

exports.amendment_course = function(){
	client.query(
		"SELECT\
			SHIP_COURSE_CONTROL(id, round(location <->my_ships.destination)::integer, null, my_ships.destination )\
		FROM my_ships WHERE (my_ships.destination <-> my_ships.location) > 10",
		function(err, result){
	        if (err) {
	            throw err;
	        }                      
   		}
   	);
}

exports.autorepair = autorepair;

exports.get_damaged_in_travel = get_damaged_in_travel;

exports.mine = mine;

exports.set_long_action = set_long_action;

exports.get_own_not_near_own_planets = function(x1, x2, y1, y2, callback){
	client.query(
		"SELECT ship.*, True own \
		FROM my_ships ship \
			LEFT JOIN planets planet ON (planet.conqueror_id = get_player_id(SESSION_USER) AND (planet.location <-> ship.location) < 10)\
		WHERE \
			ship.location_x > $1 AND ship.location_x < $2 AND ship.location_y > $3 AND ship.location_y < $4 AND \
			planet.id is NULL;",
		[x1, x2, y1, y2],
		function(err, result){
	        if (!err){
        		if(typeof(callback) == 'function'){
	        		callback(result.rows);
	        	}
	        } else {
	            throw err;
	        }                      
   		}
   	);
}

exports.get_enemy_ships = function(x1, x2, y1, y2, callback){
	client.query(
		"SELECT *, False own, enemy_location[0] location_x, enemy_location[1] location_y \
		FROM ships_in_range ship\
		WHERE\
			ship.enemy_location[0] > $1 AND ship.enemy_location[0] < $2 AND ship.enemy_location[1] > $3 AND ship.enemy_location[1] < $4 \
		LIMIT 50",
		[x1, x2, y1, y2],
		function(err, result){
	        if (!err){
        		if(typeof(callback) == 'function'){
	        		callback(result.rows);
	        	}
	        } else {
	            callback([]);
	        }
   		}
   	);
}