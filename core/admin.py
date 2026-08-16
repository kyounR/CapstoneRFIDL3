from django.contrib import admin

from .models import Card, Destination, Line, Passenger, Trip, Vehicle


admin.site.register(Passenger)
admin.site.register(Card)
admin.site.register(Vehicle)
admin.site.register(Line)
admin.site.register(Destination)
admin.site.register(Trip)
