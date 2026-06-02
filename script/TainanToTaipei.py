# -*- coding: UTF-8 -*-
#取得高鐵站名
import requests
import bs4
url = 'https://www.thsrc.com.tw'
htmlfile = requests.get(url)
htmlfile.encoding = 'utf-8'
objSoup = bs4.BeautifulSoup(htmlfile.text, 'lxml')
stations = objSoup.find('select', id='select_location01').find_all('option')
for station in stations:
    if station['value']:
        print(station.text, ':', station['value'])

#取得高鐵當天我可以搭乘的時刻表
import requests
import json
import datetime

url = "https://www.thsrc.com.tw/TimeTable/Search"

nowdate = datetime.date.today().strftime("%Y/%m/%d")
payload = '{"SearchType": "S","StartStation": "TaiNan","EndStation": "TaiPei","OutWardSearchDate": "%s","OutWardSearchTime": "11:00","Lang": "TW"}' % nowdate
headers = {
    'Content-Type': 'application/json'
}
response = requests.post(url, headers=headers, data = payload)
schedule = json.loads(response.text)
for i in schedule["data"]["DepartureTable"]["TrainItem"]:
    dptime = datetime.datetime.strptime(i["DepartureTime"],"%H:%M")
    checkintime = datetime.datetime.now()+datetime.timedelta(minutes=-60)
    if (checkintime.time() < dptime.time()):
        print(i["DepartureTime"], i["DestinationTime"],
            i["Duration"], i["NonReservedCar"])
