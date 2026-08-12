from django.contrib import admin

from .models import Card, Passenger, Route, Trip, Vehicle


admin.site.register(Passenger)
admin.site.register(Card)
admin.site.register(Vehicle)
admin.site.register(Route)
admin.site.register(Trip)
