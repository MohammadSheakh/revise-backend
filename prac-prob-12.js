// prob 1 
function twoSum(nums, target){
    const seen = new Map();

    for(let i = 0; i< nums.length; i++){
        const seen = new Map();

        const complement = target - nums[i];
        if(seen.has(complement)){
            // return 
            return [seen.get(complement), i];
        }

        // store current number
        seen.set(nums[i], i);
    }

    return []; // no solution found .. 
}

// prob 2 - Maximum Subarray ⭐ medium
/**
 * @description give an integer array nums, find the contiguous  
 *           subarray which has the largest sum and return its sum 
 * @solution - Kadane's Algorithm
 * 
 * keep track of maximum sum ending at current position .. 
 * if adding current number makes sum negative .. reset .. 
 * 
 * step by step 
 * 
 * 1. init maxSum = nums[0], currentSum = nums[0]
 * 2. for each number form index 1
 *   a. currentSum = max(num, currentSum + num)
 *        - either start new subArray or extend existing .. 
 *   b. maxSum = max(maxSum, currentSum)
 * 
 * 3. return maxSum
 * 
 */

function maxSubArray(nums){
    let maxSum = nums[0];
    let currentSum = nums[0];

    for(let i = 1; i < nums.length; i++){
        // either extend existing subArray or start new one 
        currentSum = Math.max(nums[i], currentSum + nums[i]);

        // update global maximum .. 
        maxSum = Math.max(maxSum, currentSum);
    }
    return maxSum;
}

/**
 * 
 * @problem - longest substring without repeating
 * 
 * given a string s, find the length of the longest substring
 * without repeating characters
 * 
 * example - 
 * input s = "abcabcbb"
 * output - 3
 * 
 * @solution - sliding window
 * 
 * @approach - Use two pointer to maintain a window of unique characters
 * expand window , shrink when duplicate found
 * 
 * @steps -
 * 1. create set to track character in window
 * 2. initialize left = 0, maxLength = 0
 * 3. For right from 0 to end : 
 *      a. while s[right] in SET
 *           - remove s[left] from SET
 *           - increment left
 *     b. add s[right] to SET
 *   c. update maxLength = max(maxLength, right - left + 1) 
 *  4. return maxLength 
 */

function lengthOfLongestSubstring(s) {
    const seen = new Set();
    let left = 0;
    let maxLength = 0;

    for(let right = 0; right < s.length; right++){
        // shrink window while duplicate exists
        while(seen.has(s[right])) {
            seen.delete(s[left]);
            left++
        }

        // add current character
        seen.add(s[right]);

        // update max length
        maxLength = Math.max(maxLength, right - left + 1);
    }

    return maxLength;
}


//======== Hash Maps (10 Problem)
/**
 * 
 * @problem - Group Anagram
 *  Given an array of strings, group anagrams together
 * 
 * inputs : ["eat", "Tea", "tan"]
 * output : [["eat", "tea"], ["tan"]]
 * 
 * @solution - hash map with sorted key
 * 
 * @approach - anagrams have same characters when sorted
 *  
 *  use sorted string as key to group anagram
 * 
 * @steps - 
 *  1. create map for grouping
 *  2. for each string:
 *      a. sort characters to create key
 *      b. add original string to group
 * 3. return all groups.
 * 
 */

function groupAnagrams(strs){
    const groups = new Map();

    for(const str of strs){
        // create key by sorting characters
        const key = str.split("").sort().join("");

        if(!groups.has(key)){
            groups.set(key, [])
        }

        group.get(key).push(str);
    }

    return Array.from(groups.values());
}

/**
 * Trees
 * @problem - 
 * 
 * 
 * @solution - 
 * 
 * @approach - 
 * @steps -
 * 
 */



/**
 * 
 * @problem - 
 * 
 * 
 * @solution - 
 * 
 * @approach - 
 * @steps -
 * 
 */



/**
 * 
 * @problem - 
 * 
 * 
 * @solution - 
 * 
 * @approach - 
 * @steps -
 * 
 */


